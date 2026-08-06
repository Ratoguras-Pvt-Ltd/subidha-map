import { test } from "node:test";
import assert from "node:assert/strict";

import { nameKey } from "../src/lib/erp-sync";

// The join between the ERP's dealer list and this one is the name, so what nameKey()
// treats as the same shop decides whose stock gets credited. Everything it does NOT
// fold together is reported as unmatched instead — see applyErpFeed().

test("case and spacing differences fold to the same key", () => {
  assert.equal(nameKey("Aakansha Jeneral Store"), nameKey("aakansha  jeneral store"));
  assert.equal(nameKey("  Padded Name  "), nameKey("Padded Name"));
});

test("the punctuation the two source lists disagree on is absorbed", () => {
  assert.equal(
    nameKey("Aakansha Jeneral Store,Birendra Bazar"),
    nameKey("Aakansha Jeneral Store Birendra Bazar"),
  );
  assert.equal(nameKey("Shree Gas (Main)"), nameKey("Shree Gas Main"));
  assert.equal(nameKey("Ram-Laxman Gas"), nameKey("Ram Laxman Gas"));
});

test("genuinely different dealers keep different keys", () => {
  assert.notEqual(nameKey("Krishna Gas Birtamod"), nameKey("Krishna Gas Damak"));
  assert.notEqual(nameKey("Shree Gas"), nameKey("Shree Gas Suppliers"));
});
