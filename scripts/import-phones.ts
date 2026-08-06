/**
 * Fills in missing dealer phone numbers from a CSV export of the dealer list.
 *
 *   npm run import-phones -- <file.csv>                     write the unambiguous matches
 *   npm run import-phones -- <file.csv> --dry-run           report only, touch nothing
 *   npm run import-phones -- <file.csv> --unmatched out.csv dump the rows nobody matched
 *
 * Expected columns: `Dealer Name,Area,Phone,…` (a header row is required, extra
 * trailing columns are ignored).
 *
 * Only dealers that already exist here are touched — the CSV never creates a dealer.
 * The two lists were authored separately, so matching is by name and deliberately
 * conservative:
 *
 *   Exact names resolve almost nothing (4 of 344 measured), because the CSV appends a
 *   place to every name — "Aarti Gas Pasal, Itr" against "Aarti Gas Pasal" here. So the
 *   key drops the trailing place, which lifts it to ~99.
 *
 *   A key that resolves to more than one dealer here — or to more than one CSV row
 *   carrying different numbers — is skipped, never guessed. Two branches of one chain
 *   in different towns collapse to the same key, and a wrong number sends a customer to
 *   the wrong shop.
 *
 * A dealer that already has a phone is left alone, on the same rule the KML import
 * follows: a number an admin corrected by hand outranks a bulk file.
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { placelessNameKey, readPhoneCsv } from "./dealer-csv";

const args = process.argv.slice(2);
const has = (flag: string) => args.includes(flag);
const valueOf = (flag: string) => {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
};
const dryRun = has("--dry-run");
const csvPath = args.find((a) => !a.startsWith("--") && a !== valueOf("--unmatched"));

if (!csvPath) {
  console.error("usage: npm run import-phones -- <file.csv> [--dry-run] [--unmatched out.csv]");
  process.exitCode = 1;
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL }),
});

async function main(): Promise<void> {
  if (!csvPath) return;

  const { rows, noPhone, unusable } = readPhoneCsv(readFileSync(csvPath, "utf8"));
  console.log(
    `csv: ${rows.length} row(s) with a usable phone` +
      `${noPhone ? `, ${noPhone} blank` : ""}${unusable.length ? `, ${unusable.length} unusable` : ""}`,
  );
  for (const u of unusable) console.log(`  unusable  ${u}`);

  // Collapse the CSV first: two rows sharing a key are only safe if they agree on the
  // number, otherwise there is no way to tell which dealer the number belongs to.
  const byKey = new Map<string, { name: string; phones: Set<string> }>();
  for (const row of rows) {
    const k = placelessNameKey(row.name);
    const entry = byKey.get(k) ?? { name: row.name, phones: new Set<string>() };
    entry.phones.add(row.phone);
    byKey.set(k, entry);
  }

  const dealers = await prisma.dealer.findMany({ select: { id: true, dealerName: true, phone: true } });
  console.log(`dealers here: ${dealers.length}, ${dealers.filter((d) => d.phone).length} with a phone\n`);

  const dealersByKey = new Map<string, typeof dealers>();
  for (const dealer of dealers) {
    const k = placelessNameKey(dealer.dealerName);
    dealersByKey.set(k, [...(dealersByKey.get(k) ?? []), dealer]);
  }

  const updates: { id: string; name: string; phone: string }[] = [];
  const ambiguous: string[] = [];
  const alreadySet: string[] = [];
  const unmatched: { name: string; phone: string }[] = [];

  for (const [key, entry] of byKey) {
    if (entry.phones.size > 1) {
      ambiguous.push(`${entry.name} — ${entry.phones.size} different numbers in the csv`);
      continue;
    }
    const phone = [...entry.phones][0];

    const hits = dealersByKey.get(key);
    if (!hits) {
      unmatched.push({ name: entry.name, phone });
      continue;
    }
    if (hits.length > 1) {
      ambiguous.push(`${entry.name} — matches ${hits.length} dealers here`);
      continue;
    }

    const dealer = hits[0];
    if (dealer.phone) {
      if (dealer.phone !== phone) alreadySet.push(`${dealer.dealerName}  here=${dealer.phone}  csv=${phone}`);
      continue;
    }
    updates.push({ id: dealer.id, name: dealer.dealerName, phone });
  }

  for (const u of updates) console.log(`  ${dryRun ? "would set" : "set"}  ${u.name}  ${u.phone}`);

  if (!dryRun) {
    // Sequential rather than one transaction: these are independent single-column
    // writes, and a partial run is safe to repeat — the second pass skips what landed.
    for (const u of updates) {
      await prisma.dealer.update({ where: { id: u.id }, data: { phone: u.phone } });
    }
  }

  console.log(
    `\n${dryRun ? "would fill" : "filled"} ${updates.length}` +
      `, kept ${alreadySet.length} existing, skipped ${ambiguous.length} ambiguous` +
      `, ${unmatched.length} csv row(s) match no dealer here`,
  );
  for (const a of alreadySet) console.log(`  kept       ${a}`);
  for (const a of ambiguous) console.log(`  ambiguous  ${a}`);

  const dump = valueOf("--unmatched");
  if (dump) {
    const lines = ["dealer_name,phone", ...unmatched.map((u) => `"${u.name.replace(/"/g, '""')}",${u.phone}`)];
    writeFileSync(dump, lines.join("\n"));
    console.log(`\nwrote ${unmatched.length} unmatched row(s) to ${dump}`);
  } else if (unmatched.length) {
    console.log(`\nre-run with --unmatched out.csv to export those ${unmatched.length} for review`);
  }
}

// process.exitCode rather than process.exit(): exiting here aborted the Node process on
// Windows mid-teardown ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)").
main()
  .catch((error) => {
    console.error(`\nPhone import failed: ${(error as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
