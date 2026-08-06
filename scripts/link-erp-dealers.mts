/**
 * Links dealers here to `vendors.id` in the Subidha ERP, which is the only thing the
 * stock sync matches on.
 *
 * Four modes, in the order you would use them:
 *
 *   npm run link-erp                  report: how many are linked, and which ERP dealers
 *                                     are not
 *   npm run link-erp -- --auto        link every ERP dealer whose name resolves to
 *                                     exactly one dealer here (101 of 349 today),
 *                                     skipping anything ambiguous
 *   npm run link-erp -- --template f.csv
 *                                     write the still-unlinked ERP dealers to a CSV,
 *                                     each with its best name-based guesses, to fill in
 *   npm run link-erp -- --csv f.csv   apply that filled-in mapping; columns
 *                                     erp_id,dealer_id (a header row is optional)
 *
 * Add --dry-run to either writing mode to see the effect without touching the database.
 *
 * Reads the ERP's dealer roster, so it needs ERP_FEED_URL and ERP_FEED_SECRET set — the
 * same two variables the cron uses. Every mode is incremental and never relinks or steals
 * a dealer that already carries an erpVendorId, so it is safe to re-run whenever the ERP
 * takes on new dealers.
 */
import { readFileSync, writeFileSync } from "node:fs";

import { fetchErpRoster, nameKey, placelessNameKey } from "../src/lib/erp-sync";
import { prisma } from "../src/lib/prisma";

const args = process.argv.slice(2);
const has = (flag: string) => args.includes(flag);
const valueOf = (flag: string) => {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
};
const dryRun = has("--dry-run");

/**
 * Everything runs inside one function so each mode can simply `return`.
 * process.exit() here aborted the Node process on Windows mid-teardown
 * ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)") — letting main() fall out
 * and disconnecting once at the end is both cleaner and quieter.
 */
async function main(): Promise<void> {
  const dealers = await prisma.dealer.findMany({
    select: { id: true, dealerName: true, erpVendorId: true },
  });
  const linked = dealers.filter((d) => d.erpVendorId !== null);
  console.log(`dealers here: ${dealers.length}   linked to the ERP: ${linked.length}`);

  /** Name index over dealers still free to link, so an existing link is never stolen. */
  const indexUnlinked = (keyOf: (name: string) => string) => {
    const index = new Map<string, { id: string; dealerName: string }[]>();
    for (const d of dealers) {
      if (d.erpVendorId !== null) continue;
      const k = keyOf(d.dealerName);
      index.set(k, [...(index.get(k) ?? []), d]);
    }
    return index;
  };

  // --- apply a hand-filled mapping -------------------------------------------------
  // Read before the roster is fetched: applying a CSV needs no network, so it still
  // works when the ERP is unreachable.
  const csvIn = valueOf("--csv");
  if (csvIn) {
    const rows = readFileSync(csvIn, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.split(","))
      .filter(([a]) => /^\d+$/.test(a.trim())); // drops the header without naming it

    let applied = 0;
    for (const [erpIdRaw, dealerIdRaw] of rows) {
      const erpVendorId = Number(erpIdRaw.trim());
      const dealerId = dealerIdRaw?.trim();
      if (!dealerId) continue;
      if (!dryRun) await prisma.dealer.update({ where: { id: dealerId }, data: { erpVendorId } });
      applied++;
    }
    console.log(`${dryRun ? "would apply" : "applied"} ${applied} link(s) from ${csvIn}`);
    return;
  }

  // The roster, not today's feed: every active ERP dealer can be linked up front rather
  // than trickling in as each one happens to dispatch.
  const roster = await fetchErpRoster();
  const alreadyLinked = new Set(linked.map((d) => d.erpVendorId as number));
  const pending = roster.filter((r) => !alreadyLinked.has(r.id));
  console.log(`active ERP dealers: ${roster.length}   not yet linked: ${pending.length}\n`);

  // --- auto-link the unambiguous ones ----------------------------------------------
  if (has("--auto")) {
    let linkedNow = 0;

    // Exact name first, then the place-suffix-stripped form. Both must resolve to
    // exactly one free dealer here, or the row is left for a human.
    for (const keyOf of [nameKey, placelessNameKey]) {
      const index = indexUnlinked(keyOf);
      for (const row of pending) {
        if (alreadyLinked.has(row.id)) continue;
        const hits = index.get(keyOf(row.name));
        if (!hits || hits.length !== 1) continue;
        const hit = hits[0];
        if (!dryRun) {
          await prisma.dealer.update({ where: { id: hit.id }, data: { erpVendorId: row.id } });
        }
        // Keep the in-memory view honest so the second pass cannot double-link.
        dealers.find((d) => d.id === hit.id)!.erpVendorId = row.id;
        alreadyLinked.add(row.id);
        linkedNow++;
        console.log(`  link  ${row.name}  ->  ${hit.dealerName}`);
      }
    }

    const left = pending.filter((row) => !alreadyLinked.has(row.id)).length;
    console.log(`\n${dryRun ? "would link" : "linked"} ${linkedNow}, left for review ${left}`);
    if (left) console.log("run with --template to export those for hand-mapping");
    return;
  }

  // --- write a CSV to fill in ------------------------------------------------------
  const template = valueOf("--template");
  if (template) {
    const loose = indexUnlinked(placelessNameKey);
    const lines = ["erp_id,dealer_id,erp_name,suggestions"];
    for (const row of pending) {
      const guesses = (loose.get(placelessNameKey(row.name)) ?? []).slice(0, 3);
      const suggestion = guesses.map((g) => `${g.dealerName} [${g.id}]`).join(" | ");
      lines.push(`${row.id},,"${row.name.replace(/"/g, '""')}","${suggestion.replace(/"/g, '""')}"`);
    }
    writeFileSync(template, lines.join("\n"));
    console.log(`wrote ${pending.length} unlinked ERP dealer(s) to ${template}`);
    console.log(`fill in dealer_id, then: npm run link-erp -- --csv ${template}`);
    return;
  }

  // --- default: report -------------------------------------------------------------
  if (pending.length === 0) {
    console.log("every active ERP dealer is linked.");
    return;
  }
  console.log("NOT linked — a dispatch to any of these cannot reach the map:");
  for (const row of pending.slice(0, 30)) console.log(`  ${row.name} (erp ${row.id})`);
  if (pending.length > 30) console.log(`  … and ${pending.length - 30} more`);
  console.log("\nnext: npm run link-erp -- --auto     (then --template for the remainder)");
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
