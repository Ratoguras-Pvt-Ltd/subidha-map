import { test } from "node:test";
import assert from "node:assert/strict";

import { nameKey, placelessNameKey } from "../src/lib/erp-sync";

// These keys only ever *propose* a link for scripts/link-erp-dealers.mts to write as an
// explicit Dealer.erpVendorId. The sync itself matches on that id and never on a name —
// measured against the real lists, exact names resolved 4 of 349, and loosening the key
// far enough to help started colliding, which would credit one dealer's cylinders to
// another. So a wrong suggestion costs a human one rejection; it cannot corrupt stock.

test("case and spacing differences fold to the same key", () => {
  assert.equal(nameKey("Aakansha Jeneral Store"), nameKey("aakansha  jeneral store"));
  assert.equal(nameKey("  Padded Name  "), nameKey("Padded Name"));
});

test("the punctuation the two source lists disagree on is absorbed", () => {
  assert.equal(nameKey("Shree Gas (Main)"), nameKey("Shree Gas Main"));
  assert.equal(nameKey("Ram-Laxman Gas"), nameKey("Ram Laxman Gas"));
  assert.equal(nameKey("Purnima Gr. Store & Gas Supliers,Brt."), nameKey("Purnima Gr Store & Gas Supliers Brt"));
});

test("genuinely different dealers keep different keys", () => {
  assert.notEqual(nameKey("Krishna Gas Birtamod"), nameKey("Krishna Gas Damak"));
  assert.notEqual(nameKey("Shree Gas"), nameKey("Shree Gas Suppliers"));
});

test("placelessNameKey drops the trailing place the ERP appends", () => {
  // The ERP writes "Shop, Place"; the KML-derived list here writes just "Shop".
  assert.equal(placelessNameKey("Aarti Gas Pasal, Itr"), nameKey("Aarti Gas Pasal"));
  assert.equal(placelessNameKey("Aakansha Jeneral Store,Birendra Bazar"), nameKey("Aakansha Jeneral Store"));
  assert.equal(placelessNameKey("Aayan Kirana Suppliers (Itahari)"), nameKey("Aayan Kirana Suppliers"));
});

test("placelessNameKey still separates dealers that differ before the comma", () => {
  assert.notEqual(placelessNameKey("Anil Kirana Pasal, Katahari"), placelessNameKey("Anjali Traders, Katahari"));
  // Two branches of one chain in different towns collapse to the same key — which is
  // exactly why --auto refuses to write when a key resolves to more than one dealer.
  assert.equal(placelessNameKey("Krishna Gas, Damak"), placelessNameKey("Krishna Gas, Birtamod"));
});
