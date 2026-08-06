import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { extractPhone, parseCoordinates, parseKml, makeSourceKey } from "../scripts/kml";
import { RESET_TIMEZONE, deriveStatus, isPlottedOnMap, matchesFilter } from "../src/lib/stock";
import { haversineKm, isWithinNepal } from "../src/lib/geo";

/**
 * A miniature of the real export: a plain dealer, a CDATA-wrapped name, the saved
 * driving route, the empty placemark, and a nested folder.
 */
const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Maruti Gas Dealer </name>
    <Folder>
      <name>Biratnagar </name>
      <Placemark>
        <name>Karki Suppler</name>
        <description>9807791022- 500 qty</description>
        <Point><coordinates>
            87.278435,26.6758,0
          </coordinates></Point>
      </Placemark>
      <Placemark>
        <name><![CDATA[Neelkantha ghadi & Gas store]]></name>
        <description>Gas Store </description>
        <Point><coordinates>87.502686,26.736851,0</coordinates></Point>
      </Placemark>
      <Placemark>
        <name/>
      </Placemark>
    </Folder>
    <Folder>
      <name>Directions from maruti gas  to maruti gas </name>
      <Placemark>
        <name>Directions from maruti gas  to maruti gas </name>
        <LineString><coordinates>87.27464,26.58874,0 87.27503,26.58865,0</coordinates></LineString>
      </Placemark>
      <Folder>
        <name>ITAHARI</name>
        <Placemark>
          <name>Bhagat Kirana Pasa</name>
          <Point><coordinates>87.1229919,26.4996952,0</coordinates></Point>
        </Placemark>
      </Folder>
    </Folder>
  </Document>
</kml>`;

test("parseKml keeps point placemarks and drops the route and the blank name", () => {
  const { dealers, skipped } = parseKml(FIXTURE);

  assert.equal(dealers.length, 3);
  assert.deepEqual(
    dealers.map((d) => d.dealerName),
    ["Karki Suppler", "Neelkantha ghadi & Gas store", "Bhagat Kirana Pasa"],
  );

  assert.equal(skipped.length, 2);
  assert.ok(skipped.some((s) => s.reason === "blank name"));
  assert.ok(skipped.some((s) => s.reason.includes("LineString")));
});

test("KML coordinates are lon,lat — latitude must not end up in the longitude column", () => {
  const { dealers } = parseKml(FIXTURE);
  const karki = dealers[0];

  // 87.278435,26.6758 → lat 26.6758 (Nepal), lng 87.278435.
  assert.equal(karki.latitude, 26.6758);
  assert.equal(karki.longitude, 87.278435);
  assert.ok(isWithinNepal(karki.latitude, karki.longitude));
  // The swap would land in the Arabian Sea and must be rejected.
  assert.equal(isWithinNepal(karki.longitude, karki.latitude), false);
});

test("parseCoordinates handles surrounding whitespace and rejects junk", () => {
  assert.deepEqual(parseCoordinates("\n  87.278435,26.6758,0\n  "), {
    lat: 26.6758,
    lng: 87.278435,
  });
  assert.deepEqual(parseCoordinates("87.5, 26.7"), { lat: 26.7, lng: 87.5 });
  assert.equal(parseCoordinates("87.5"), null);
  assert.equal(parseCoordinates(null), null);
  assert.equal(parseCoordinates("north,east"), null);
});

test("a nested folder is attributed to the innermost folder name", () => {
  const { dealers } = parseKml(FIXTURE);
  assert.equal(dealers[0].folder, "Biratnagar");
  assert.equal(dealers[2].folder, "ITAHARI");
});

test("descriptions that are bare digits stay strings and are read as phones", () => {
  const { dealers } = parseKml(FIXTURE);
  // Guards the parseTagValue:false parser option — otherwise fast-xml-parser
  // coerces "9807791022- 500 qty"-style values and bare numbers to Number.
  assert.equal(dealers[0].phone, "9807791022");
  assert.equal(dealers[0].notes, "9807791022- 500 qty");
  assert.equal(dealers[1].phone, null);
});

test("extractPhone copes with every shape observed in the real export", () => {
  assert.equal(extractPhone("9807791022- 500 qty"), "9807791022");
  assert.equal(extractPhone("+977 981-9050463"), "9819050463");
  assert.equal(extractPhone("9852056515,9807065215"), "9852056515", "takes the first number");
  assert.equal(extractPhone("9841178942-ashim Rai"), "9841178942");
  assert.equal(extractPhone("- saroj mehat - 9802761320"), "9802761320");
  assert.equal(extractPhone("9852058908 - 150qty"), "9852058908");
  assert.equal(extractPhone("9819373948- Dev bhadur Rai - already doing business -150 qty"), "9819373948");
  assert.equal(extractPhone("9700502995"), "9700502995", "97 prefix");
  assert.equal(extractPhone("9862053617"), "9862053617", "98 prefix");

  // Not phone numbers.
  assert.equal(extractPhone("//025874102547/"), null, "12-digit blob is not a mobile");
  assert.equal(extractPhone("raja biratchowk"), null);
  assert.equal(extractPhone("Gas Store "), null);
  assert.equal(extractPhone("will order at 18th gathey"), null);
  assert.equal(extractPhone(null), null);
  assert.equal(extractPhone(""), null);
});

/** Two "Shiva Guru" pins 3 m apart plus a genuinely distinct shop 2 km away. */
const MERGE_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Folder>
      <name>Biratnagar</name>
      <Placemark>
        <name>Shiva Guru</name>
        <Point><coordinates>87.28000,26.58000,0</coordinates></Point>
      </Placemark>
      <Placemark>
        <name>Shiva Guru</name>
        <description>9807791022</description>
        <Point><coordinates>87.280025,26.580010,0</coordinates></Point>
      </Placemark>
      <Placemark>
        <name>Shiva Guru</name>
        <Point><coordinates>87.30000,26.59000,0</coordinates></Point>
      </Placemark>
    </Folder>
  </Document>
</kml>`;

test("same-name pins metres apart merge, and the survivor absorbs the phone", () => {
  const { dealers, merged } = parseKml(MERGE_FIXTURE);

  assert.equal(dealers.length, 2, "the 3 m pair collapses; the 2 km shop stays");
  assert.equal(merged.length, 1);
  assert.equal(merged[0].dealerName, "Shiva Guru");
  assert.ok(merged[0].metres <= 5, `expected a few metres, got ${merged[0].metres}`);

  // The duplicate carried the only phone number — it must survive the merge.
  assert.equal(dealers[0].phone, "9807791022");
  assert.equal(dealers[1].phone, null);
});

test("mergeNearbyMetres: 0 keeps every pin", () => {
  const { dealers, merged } = parseKml(MERGE_FIXTURE, { mergeNearbyMetres: 0 });
  assert.equal(dealers.length, 3);
  assert.equal(merged.length, 0);
});

test("sourceKey is coordinate-based, so relabelling a dealer does not orphan its row", () => {
  const a = makeSourceKey(26.6758, 87.278435);
  assert.equal(a, makeSourceKey(26.6758, 87.278435), "stable across runs");
  assert.notEqual(a, makeSourceKey(26.5, 87.278435), "different spot, different key");

  // The regression this guards: a renamed placemark must keep its identity, or the
  // re-import inserts a duplicate and abandons the original row's stock history.
  const { dealers } = parseKml(FIXTURE);
  assert.equal(dealers[0].sourceKey, makeSourceKey(dealers[0].latitude, dealers[0].longitude));
});

test("placeholder-titled placemarks get a readable name, original kept in notes", () => {
  // The three junk-name shapes actually present in the export.
  const placeholder = (name: string, lng: number, lat: number) => `
    <Placemark><name><![CDATA[${name}]]></name>
      <Point><coordinates>${lng},${lat},0</coordinates></Point></Placemark>`;

  const { dealers } = parseKml(`<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Folder><name>East</name>
  ${placeholder("26.663315, 87.310768", 87.310768, 26.663315)}
  ${placeholder(`26°31'26.1"N 87°06'24.1"E`, 87.106694, 26.523917)}
  ${placeholder("Point 34", 87.322708, 26.648019)}
  ${placeholder("Karki Suppler", 87.278435, 26.6758)}
</Folder></Document></kml>`);

  assert.equal(dealers.length, 4);
  assert.deepEqual(
    dealers.map((d) => d.dealerName),
    ["Unnamed dealer", "Unnamed dealer", "Unnamed dealer", "Karki Suppler"],
  );
  assert.match(dealers[0].notes ?? "", /26\.663315, 87\.310768/);
  assert.match(dealers[2].notes ?? "", /Point 34/);
});

test("a real name beats a placeholder when both sit on one coordinate", () => {
  // "Point 34" precedes "Minakshi Rankani Suppliers" in the real export, so keeping
  // whichever came first would discard the only useful name.
  const { dealers, skipped } = parseKml(`<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Folder><name>East</name>
  <Placemark><name>Point 34</name>
    <Point><coordinates>87.3227075,26.6480189,0</coordinates></Point></Placemark>
  <Placemark><name>Minakshi Rankani Suppliers</name><description>9812345678</description>
    <Point><coordinates>87.3227075,26.6480189,0</coordinates></Point></Placemark>
</Folder></Document></kml>`);

  assert.equal(dealers.length, 1);
  assert.equal(dealers[0].dealerName, "Minakshi Rankani Suppliers");
  // The surviving row also inherits contact details only the duplicate carried.
  assert.equal(dealers[0].phone, "9812345678");
  assert.equal(skipped.filter((s) => s.reason.startsWith("duplicate")).length, 1);
});

test("deriveStatus at every threshold boundary", () => {
  assert.equal(deriveStatus(0), "OUT_OF_STOCK");
  assert.equal(deriveStatus(-5), "OUT_OF_STOCK", "negative can't happen but must not read as stocked");
  assert.equal(deriveStatus(1), "CRITICAL");
  assert.equal(deriveStatus(9), "CRITICAL");
  assert.equal(deriveStatus(10), "LOW_STOCK");
  assert.equal(deriveStatus(50), "LOW_STOCK");
  assert.equal(deriveStatus(51), "AVAILABLE");
  assert.equal(deriveStatus(125), "AVAILABLE");
});

test("the three public filters cover all four statuses", () => {
  assert.equal(matchesFilter("AVAILABLE", "AVAILABLE"), true);
  assert.equal(matchesFilter("LOW_STOCK", "AVAILABLE"), false);

  // Yellow and red both answer "who is running low?".
  assert.equal(matchesFilter("LOW_STOCK", "LOW"), true);
  assert.equal(matchesFilter("CRITICAL", "LOW"), true);
  assert.equal(matchesFilter("OUT_OF_STOCK", "LOW"), false);

  assert.equal(matchesFilter("OUT_OF_STOCK", "OUT"), true);
  assert.equal(matchesFilter("CRITICAL", "OUT"), false);

  for (const s of ["AVAILABLE", "LOW_STOCK", "CRITICAL", "OUT_OF_STOCK"] as const) {
    assert.equal(matchesFilter(s, "ALL"), true);
  }
});

test("only dealers holding cylinders get a map pin", () => {
  assert.equal(isPlottedOnMap("AVAILABLE"), true);
  assert.equal(isPlottedOnMap("LOW_STOCK"), true);
  assert.equal(isPlottedOnMap("CRITICAL"), true, "a dealer with 1 cylinder can still sell it");
  assert.equal(isPlottedOnMap("OUT_OF_STOCK"), false);

  // Anything deriveStatus() calls stocked must be plottable, so a future threshold
  // change cannot silently hide dealers who do have cylinders.
  for (const qty of [1, 9, 10, 50, 51, 999]) {
    assert.equal(isPlottedOnMap(deriveStatus(qty)), true, `${qty} cylinders must be on the map`);
  }
  assert.equal(isPlottedOnMap(deriveStatus(0)), false);
});

test("the cron schedule in vercel.json really is midnight in Nepal", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const cron = config.crons.find((c: { path: string }) => c.path === "/api/cron/reset-stock");
  assert.ok(cron, "reset-stock cron must be registered");

  // Vercel cron schedules are UTC: "minute hour * * *".
  const [minute, hour] = cron.schedule.split(" ").map(Number);

  // Take that UTC time on an arbitrary date and render it in Kathmandu.
  const utc = new Date(Date.UTC(2026, 0, 15, hour, minute));
  const kathmandu = new Intl.DateTimeFormat("en-GB", {
    timeZone: RESET_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(utc);

  assert.equal(kathmandu, "00:00", `${cron.schedule} UTC is ${kathmandu} in Nepal, not midnight`);

  // Nepal has no DST, so the same schedule must hold in July as in January.
  const july = new Date(Date.UTC(2026, 6, 15, hour, minute));
  assert.equal(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: RESET_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(july),
    "00:00",
  );
});

test("haversineKm returns a sane distance across the dealer network", () => {
  // Biratnagar depot to an Itahari dealer — roughly 20 km apart.
  const km = haversineKm(26.5887411, 87.2746376, 26.4996952, 87.1229919);
  assert.ok(km > 15 && km < 25, `expected 15–25 km, got ${km}`);
  assert.equal(haversineKm(26.5, 87.2, 26.5, 87.2), 0);
});
