/**
 * Imports every dealer from the Google My Maps KML export into Postgres.
 *
 *   npm run import                    full run, reverse-geocodes uncached points
 *   npm run import -- --skip-geocode  coordinates only, no network
 *   npm run import -- --dry-run       parse and report, touch nothing
 *   npm run import -- --no-merge      keep same-name pins a few metres apart
 *
 * Idempotent: rows are matched on `sourceKey`, and stock is only ever set when a
 * dealer is first created, so a re-import never wipes numbers staff have entered.
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { parseKml, type ParsedDealer } from "./kml";
import { cacheKey, geocodeAll, type GeocodeResult } from "./geocode";

const DEFAULT_KML = path.join("Maruti Gas Dealer (1).kmz", "doc.kml");

/**
 * The source export holds 411 placemarks: 409 points, one saved driving route and
 * one empty placemark. Of the points, 4 repeat on an identical coordinate and a
 * further 15 are the same shop pinned 2–31 m away (mostly the "Directions" folder
 * re-listing dealers that already appear in a regional folder), leaving 390 real
 * dealers.
 *
 * Asserting the number means a parser regression fails loudly instead of silently
 * importing half the network. Update it deliberately when the export changes, and
 * note it only holds at the default merge radius (--no-merge yields 405).
 */
const EXPECTED_DEALERS = 390;

/** Same name within this radius is one shop pinned twice — see DEFAULT_MERGE_METRES. */
const NEAR_DUPLICATE_METRES = 50;

const args = new Set(process.argv.slice(2));
const skipGeocode = args.has("--skip-geocode");
const dryRun = args.has("--dry-run");
const noMerge = args.has("--no-merge");

/**
 * The KML folders are the map author's own grouping, and only some name a place:
 * "Biratnagar", "Sonapur" and "ITAHARI" are towns, while "East", "West", "Mountain",
 * "Other", "Gas", "new dealers" and "Directions…" are route zones or bookkeeping.
 *
 * So a folder is at best a *municipality* hint and is never a district — Nominatim
 * is the only source for those. Filing a Biratnagar-folder dealer that actually sits
 * in Itahari under district "Biratnagar" would be worse than leaving it blank.
 */
const PLACE_FOLDERS = new Set(["biratnagar", "sonapur", "itahari"]);

function folderAsMunicipality(folder: string | null): string | null {
  if (!folder) return null;
  const cleaned = folder.trim().replace(/\s+/g, " ");
  if (!PLACE_FOLDERS.has(cleaned.toLowerCase())) return null;
  return cleaned.replace(/\p{L}+/gu, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

async function main() {
  const kmlPath = process.env.KML_PATH || DEFAULT_KML;

  console.log(`Reading ${kmlPath}`);
  const xml = await readFile(kmlPath, "utf8");

  const { dealers, skipped, merged } = parseKml(xml, {
    mergeNearbyMetres: noMerge ? 0 : NEAR_DUPLICATE_METRES,
  });

  console.log(`\nParsed ${dealers.length} dealers, skipped ${skipped.length}:`);
  for (const s of skipped) console.log(`  - ${s.reason}: ${s.detail}`);

  if (merged.length > 0) {
    console.log(
      `\nMerged ${merged.length} same-name pin(s) within ${NEAR_DUPLICATE_METRES} m ` +
        `(pass --no-merge to keep them separate):`,
    );
    for (const m of merged) console.log(`  ~ "${m.dealerName}" (${m.metres} m apart)`);
  }

  const withPhone = dealers.filter((d) => d.phone).length;
  console.log(`\n  ${withPhone} of ${dealers.length} dealers have a phone number in the source.`);

  if (!noMerge && dealers.length !== EXPECTED_DEALERS) {
    throw new Error(
      `Expected ${EXPECTED_DEALERS} dealers from this export but parsed ${dealers.length}. ` +
        `Either the KML changed or the parser regressed — refusing to import.`,
    );
  }

  let geocoded = new Map<string, GeocodeResult>();
  if (skipGeocode) {
    console.log("\nSkipping reverse geocoding (--skip-geocode).");
  } else {
    const contact = process.env.GEOCODE_CONTACT;
    if (!contact) {
      throw new Error(
        "GEOCODE_CONTACT must be set — Nominatim's usage policy requires a contact " +
          "address in the User-Agent. Set it in .env or pass --skip-geocode.",
      );
    }

    console.log("\nReverse geocoding via OpenStreetMap Nominatim (1 request/sec)…");
    geocoded = await geocodeAll(dealers, {
      contact,
      onProgress: (done, total, cached) => {
        if (cached && done % 50 !== 0) return;
        const suffix = cached ? "(cached)" : "";
        process.stdout.write(`\r  ${done}/${total} ${suffix}      `);
      },
    });
    process.stdout.write("\n");
  }

  const resolve = (d: ParsedDealer) => {
    const geo = geocoded.get(cacheKey(d.latitude, d.longitude));
    return {
      address: geo?.address ?? null,
      // Nominatim only for district; a folder is never authoritative for it.
      district: geo?.district ?? null,
      municipality: geo?.municipality ?? folderAsMunicipality(d.folder),
    };
  };

  if (dryRun) {
    console.log("\n--dry-run: nothing written. Sample of what would be imported:\n");
    for (const d of dealers.slice(0, 5)) {
      const geo = resolve(d);
      console.log(
        `  ${d.dealerName}\n    ${d.latitude}, ${d.longitude}` +
          `\n    phone: ${d.phone ?? "-"}\n    district: ${geo.district ?? "-"}` +
          `\n    address: ${geo.address ?? "-"}\n`,
      );
    }
    return;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set — copy .env.example to .env and fill it in.");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    console.log("\nWriting to database…");
    let created = 0;
    let updated = 0;

    for (const [index, d] of dealers.entries()) {
      const geo = resolve(d);

      const existing = await prisma.dealer.findUnique({
        where: { sourceKey: d.sourceKey },
        select: { phone: true, address: true, district: true, municipality: true },
      });

      if (!existing) {
        await prisma.dealer.create({
          data: {
            sourceKey: d.sourceKey,
            dealerName: d.dealerName,
            latitude: d.latitude,
            longitude: d.longitude,
            phone: d.phone,
            notes: d.notes,
            address: geo.address,
            district: geo.district,
            municipality: geo.municipality,
            // stockQuantity/status keep their schema defaults: 0 / OUT_OF_STOCK.
          },
        });
        created++;
      } else {
        // `phone` is only ever filled when blank — a number an admin corrected must
        // survive a re-import, since the stale KML would otherwise undo their work.
        //
        // Location fields work the other way when geocoding ran: Nominatim is more
        // authoritative than whatever placeholder is in the row, so it overwrites.
        // That is what lets a second run repair districts written by an earlier
        // --skip-geocode pass. With --skip-geocode we have nothing better to offer,
        // so it falls back to filling blanks only.
        const location = skipGeocode
          ? {
              ...(existing.address === null && geo.address ? { address: geo.address } : {}),
              ...(existing.district === null && geo.district ? { district: geo.district } : {}),
              ...(existing.municipality === null && geo.municipality
                ? { municipality: geo.municipality }
                : {}),
            }
          : {
              ...(geo.address ? { address: geo.address } : {}),
              ...(geo.district ? { district: geo.district } : {}),
              ...(geo.municipality ? { municipality: geo.municipality } : {}),
            };

        const data = {
          ...location,
          ...(existing.phone === null && d.phone ? { phone: d.phone } : {}),
        };

        if (Object.keys(data).length > 0) {
          await prisma.dealer.update({ where: { sourceKey: d.sourceKey }, data });
        }
        updated++;
      }

      if ((index + 1) % 50 === 0) {
        process.stdout.write(`\r  ${index + 1}/${dealers.length}`);
      }
    }

    process.stdout.write("\n");
    console.log(`\nDone. ${created} created, ${updated} already present (blanks filled).`);
    console.log(`Total dealers in database: ${await prisma.dealer.count()}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`\nImport failed: ${(error as Error).message}`);
  process.exit(1);
});
