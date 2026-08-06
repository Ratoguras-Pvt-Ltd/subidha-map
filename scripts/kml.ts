import { XMLParser } from "fast-xml-parser";
import { haversineKm, isWithinNepal } from "../src/lib/geo";

/**
 * Same-named placemarks closer together than this are one shop pinned twice, not
 * two shops. Every observed pair in the source export sits 2–31 m apart — inside a
 * single building plot — and most come from the "Directions" folder re-listing
 * dealers that already appear in a regional folder.
 */
export const DEFAULT_MERGE_METRES = 50;

/**
 * Names that carry no information about the shop. 13 source placemarks have one:
 *   - decimal coordinates pasted into the title — "26.663315, 87.310768"
 *   - degrees/minutes/seconds — `26°31'26.1"N 87°06'24.1"E`
 *   - Google My Maps auto-placeholders — "Point 34"
 * Showing "Point 17" to a customer hunting for a gas dealer is worse than admitting
 * the name is unknown, so these become UNNAMED_DEALER and the locality carries the
 * identification instead.
 */
const PLACEHOLDER_NAME = new RegExp(
  [
    String.raw`^-?\d+\.\d+\s*,\s*-?\d+\.\d+$`, // 26.663315, 87.310768
    String.raw`^[\d°'"\s.NSEW]+$`, // 26°31'26.1"N 87°06'24.1"E
    String.raw`^(?:point|line|marker|place|untitled)\s*\d*$`, // Point 34
  ].join("|"),
  "i",
);

export const UNNAMED_DEALER = "Unnamed dealer";

export type ParsedDealer = {
  sourceKey: string;
  dealerName: string;
  latitude: number;
  longitude: number;
  phone: string | null;
  /** Raw <description>, preserved verbatim. */
  notes: string | null;
  /** Enclosing KML folder — the only district hint the source provides. */
  folder: string | null;
};

export type ParseResult = {
  dealers: ParsedDealer[];
  skipped: { reason: string; detail: string }[];
  /** Same-name pins collapsed by mergeNearby(), reported so the merge is never silent. */
  merged: { dealerName: string; metres: number }[];
};

export type ParseOptions = {
  /** Set to 0 to keep every same-name pin as its own dealer. */
  mergeNearbyMetres?: number;
};

/**
 * Collapses same-named dealers that sit within `metres` of each other, keeping the
 * first pin and absorbing any phone or note the duplicate carried.
 */
function mergeNearby(
  dealers: ParsedDealer[],
  metres: number,
): { dealers: ParsedDealer[]; merged: ParseResult["merged"] } {
  if (metres <= 0) return { dealers, merged: [] };

  const kept: ParsedDealer[] = [];
  const merged: ParseResult["merged"] = [];
  const byName = new Map<string, ParsedDealer[]>();

  for (const dealer of dealers) {
    const nameKey = dealer.dealerName.trim().toLowerCase();
    const siblings = byName.get(nameKey);

    const twin = siblings?.find(
      (s) =>
        haversineKm(s.latitude, s.longitude, dealer.latitude, dealer.longitude) * 1000 <= metres,
    );

    if (twin) {
      merged.push({
        dealerName: dealer.dealerName,
        metres: Math.round(
          haversineKm(twin.latitude, twin.longitude, dealer.latitude, dealer.longitude) * 1000,
        ),
      });
      // Don't lose contact details that only the duplicate had.
      twin.phone ??= dealer.phone;
      twin.notes ??= dealer.notes;
      continue;
    }

    kept.push(dealer);
    byName.set(nameKey, [...(siblings ?? []), dealer]);
  }

  return { dealers: kept, merged };
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * KML text nodes arrive as a plain string, or as `{ __cdata: "..." }` for the 18
 * dealer names wrapped in CDATA. `parseTagValue` is off in the parser below, so a
 * description of "9820706326" stays a string and never becomes a number.
 */
function textOf(node: unknown): string | null {
  if (node === undefined || node === null) return null;
  if (typeof node === "string") return node.trim() || null;
  if (typeof node === "number") return String(node);
  if (typeof node === "object") {
    const cdata = (node as Record<string, unknown>).__cdata;
    if (cdata !== undefined) return textOf(cdata);
  }
  return null;
}

/**
 * Rounded coordinates, and deliberately *not* the dealer name.
 *
 * The key has to identify the physical shop across re-imports. Including the name
 * meant any relabelling — a typo fixed in the KML, or this script normalising a
 * coordinate-titled placemark — produced a new key, so the re-import inserted a
 * duplicate and orphaned the original row along with its stock history.
 *
 * 5 decimal places is about 1 m, so a collision means two placemarks on the same
 * spot, which parseKml already reports as a duplicate rather than silently merging.
 */
export function makeSourceKey(lat: number, lng: number): string {
  return `geo:${lat.toFixed(5)},${lng.toFixed(5)}`;
}

/**
 * Pull a Nepali mobile number out of the free-text KML description.
 *
 * The source packs phone, contact person and volume notes into one field, so the
 * observed shapes vary a lot: "9807791022- 500 qty", "+977 981-9050463",
 * "9852056515,9807065215", "9841178942-ashim Rai", "//025874102547/".
 *
 * Walks the string looking for a run of exactly ten digits starting 96/97/98,
 * tolerating spaces and dashes inside the run. A regex that handled every
 * separator placement was less readable than this loop.
 */
export function extractPhone(description: string | null | undefined): string | null {
  if (!description) return null;

  // Normalise a country code so "+977 981-9050463" and "9819050463" agree.
  const text = description.replace(/\+?977[\s-]?(?=9)/g, "");

  for (let i = 0; i < text.length; i++) {
    if (!/\d/.test(text[i])) continue;
    // Only start a candidate at the beginning of a digit run.
    if (i > 0 && /\d/.test(text[i - 1])) continue;

    let digits = "";
    let j = i;
    while (j < text.length && digits.length < 10) {
      const c = text[j];
      if (/\d/.test(c)) digits += c;
      else if (/[\s-]/.test(c) && digits.length > 0) {
        // separator inside the number — skip it
      } else break;
      j++;
    }

    if (!/^9[678]\d{8}$/.test(digits)) continue;
    // An 11th digit means this was a longer blob, not a mobile number.
    if (j < text.length && /\d/.test(text[j])) continue;

    return digits;
  }

  return null;
}

/** `lon,lat,alt` — KML's ordering, which is the reverse of Leaflet's. */
export function parseCoordinates(raw: string | null): { lat: number; lng: number } | null {
  if (!raw) return null;
  const parts = raw.trim().split(/\s*,\s*/);
  if (parts.length < 2) return null;

  const lng = Number(parts[0]);
  const lat = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return { lat, lng };
}

type KmlNode = Record<string, unknown>;

/** Depth-first walk so nested folders keep the nearest enclosing folder name. */
function collectPlacemarks(
  node: KmlNode,
  folder: string | null,
  out: { placemark: KmlNode; folder: string | null }[],
): void {
  for (const placemark of asArray(node.Placemark as KmlNode | KmlNode[])) {
    out.push({ placemark, folder });
  }
  for (const child of asArray(node.Folder as KmlNode | KmlNode[])) {
    collectPlacemarks(child, textOf(child.name) ?? folder, out);
  }
}

export function parseKml(xml: string, options: ParseOptions = {}): ParseResult {
  const parser = new XMLParser({
    ignoreAttributes: true,
    cdataPropName: "__cdata",
    // Critical: without this a description of "9820706326" is coerced to a number
    // and a coordinate string loses precision.
    parseTagValue: false,
    trimValues: true,
  });

  const tree = parser.parse(xml) as KmlNode;
  const document = (tree.kml as KmlNode | undefined)?.Document as KmlNode | undefined;
  if (!document) throw new Error("No <Document> found — is this a KML file?");

  const found: { placemark: KmlNode; folder: string | null }[] = [];
  collectPlacemarks(document, null, found);

  const dealers: ParsedDealer[] = [];
  const skipped: ParseResult["skipped"] = [];
  // sourceKey -> index into `dealers`, so a later placemark can upgrade the kept one.
  const seen = new Map<string, number>();

  for (const { placemark, folder } of found) {
    const dealerName = textOf(placemark.name);

    // Drops the one empty <name/> placemark.
    if (!dealerName) {
      skipped.push({ reason: "blank name", detail: `in folder "${folder ?? "-"}"` });
      continue;
    }

    // Drops the saved driving route (a <LineString>, not a dealer).
    const point = placemark.Point as KmlNode | undefined;
    if (!point) {
      const geometry = placemark.LineString ? "LineString" : "no geometry";
      skipped.push({ reason: `not a point (${geometry})`, detail: dealerName });
      continue;
    }

    const coords = parseCoordinates(textOf(point.coordinates));
    if (!coords) {
      skipped.push({ reason: "unparseable coordinates", detail: dealerName });
      continue;
    }

    // Guards against swapped lat/lng, which would silently scatter dealers across
    // the Indian Ocean rather than fail.
    if (!isWithinNepal(coords.lat, coords.lng)) {
      skipped.push({
        reason: "coordinates outside Nepal",
        detail: `${dealerName} (${coords.lat}, ${coords.lng})`,
      });
      continue;
    }

    let notes = textOf(placemark.description);
    let label = dealerName;

    if (PLACEHOLDER_NAME.test(dealerName)) {
      label = UNNAMED_DEALER;
      notes = notes ? `${notes} (source label: ${dealerName})` : `Source label: ${dealerName}`;
    }

    const sourceKey = makeSourceKey(coords.lat, coords.lng);

    const twinIndex = seen.get(sourceKey);
    if (twinIndex !== undefined) {
      const twin = dealers[twinIndex];

      // "Point 34" and "Minakshi Rankani Suppliers" sit on the same coordinate: the
      // placeholder happens to come first in the file, so without this the real shop
      // name would be the one thrown away.
      if (twin.dealerName === UNNAMED_DEALER && label !== UNNAMED_DEALER) {
        twin.dealerName = label;
      }
      twin.phone ??= extractPhone(notes);
      twin.notes ??= notes;

      skipped.push({ reason: "duplicate of earlier placemark", detail: dealerName });
      continue;
    }
    seen.set(sourceKey, dealers.length);

    dealers.push({
      sourceKey,
      dealerName: label,
      latitude: coords.lat,
      longitude: coords.lng,
      phone: extractPhone(notes),
      notes,
      folder,
    });
  }

  const { dealers: deduped, merged } = mergeNearby(
    dealers,
    options.mergeNearbyMetres ?? DEFAULT_MERGE_METRES,
  );

  return { dealers: deduped, skipped, merged };
}
