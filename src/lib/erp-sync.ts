import { prisma } from "./prisma";
import { deriveStatus } from "./stock";

/** Marker written to StockHistory.updatedBy for quantities the ERP pull set. */
export const ERP_ACTOR = "system:erp-sync";

/** One dealer's dispatched total for the day, as the ERP reports it. */
type ErpDealer = {
  id: number;
  name: string;
  qty: number;
};

export type ErpFeed = {
  date: string;
  timezone: string;
  dealers: ErpDealer[];
};

export type SyncSummary = {
  /** The business date the ERP says these quantities belong to. */
  date: string;
  /** Feed rows whose dealer name matched a row here. */
  matched: number;
  /** Of those, the ones whose quantity actually changed (the rest were already correct). */
  updated: number;
  /** Feed rows with no dealer of that name — someone has to reconcile these by hand. */
  unmatched: string[];
  /** Feed rows sharing one normalised name here, so which dealer to credit is ambiguous. */
  ambiguous: string[];
};

/**
 * The ERP and this map keep separate dealer lists that were never linked by id, so names
 * are the only join available. Normalising both sides absorbs the differences that don't
 * change which shop is meant — case, doubled spaces, and the punctuation the two source
 * files disagree on ("Shop, Birendra Bazar" vs "Shop Birendra Bazar").
 *
 * ponytail: a name key, not a fuzzy match. Anything this misses is reported as unmatched
 * rather than guessed at — crediting the wrong dealer's stock is worse than a gap.
 */
export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()'"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pulls today's dispatched cylinder counts from the ERP.
 *
 * `no-store` because the whole point is the current number, and a cached response would
 * quietly serve the previous hour's figure.
 */
export async function fetchErpFeed(): Promise<ErpFeed> {
  const url = process.env.ERP_FEED_URL;
  const secret = process.env.ERP_FEED_SECRET;
  if (!url) throw new Error("ERP_FEED_URL is not set.");
  if (!secret) throw new Error("ERP_FEED_SECRET is not set.");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`ERP feed responded ${response.status} ${response.statusText}`);
  }

  const feed = (await response.json()) as ErpFeed;
  if (!Array.isArray(feed?.dealers)) {
    throw new Error("ERP feed did not contain a dealers array.");
  }
  return feed;
}

/**
 * Writes the ERP's dispatched quantities onto the matching dealers.
 *
 * Two deliberate limits:
 *
 *   Quantities are *set*, not added, so re-running the sync in the same day is harmless —
 *   the feed already reports the day's running total per dealer.
 *
 *   Dealers absent from the feed are left exactly as they are, never zeroed. Absent means
 *   "no dispatch recorded yet today", and the nightly reset is what clears yesterday's
 *   numbers. Zeroing here would also wipe any count an admin entered by hand.
 */
export async function applyErpFeed(feed: ErpFeed): Promise<SyncSummary> {
  const dealers = await prisma.dealer.findMany({
    select: { id: true, dealerName: true, stockQuantity: true },
  });

  const byName = new Map<string, { id: string; stockQuantity: number }>();
  const duplicated = new Set<string>();
  for (const dealer of dealers) {
    const key = nameKey(dealer.dealerName);
    if (byName.has(key)) duplicated.add(key);
    byName.set(key, { id: dealer.id, stockQuantity: dealer.stockQuantity });
  }

  const unmatched: string[] = [];
  const ambiguous: string[] = [];
  const changes: { id: string; previousQuantity: number; newQuantity: number }[] = [];
  let matched = 0;

  for (const row of feed.dealers) {
    const key = nameKey(row.name);
    if (duplicated.has(key)) {
      ambiguous.push(row.name);
      continue;
    }
    const dealer = byName.get(key);
    if (!dealer) {
      unmatched.push(row.name);
      continue;
    }
    matched++;
    if (dealer.stockQuantity === row.qty) continue;
    changes.push({ id: dealer.id, previousQuantity: dealer.stockQuantity, newQuantity: row.qty });
  }

  // One transaction so no quantity can land without its audit row — same rule updateStock follows.
  if (changes.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const change of changes) {
        await tx.dealer.update({
          where: { id: change.id },
          data: {
            stockQuantity: change.newQuantity,
            status: deriveStatus(change.newQuantity),
          },
        });
      }

      await tx.stockHistory.createMany({
        data: changes.map((change) => ({
          dealerId: change.id,
          previousQuantity: change.previousQuantity,
          newQuantity: change.newQuantity,
          updatedBy: ERP_ACTOR,
          updatedByName: "ERP dispatch sync",
        })),
      });
    });
  }

  return { date: feed.date, matched, updated: changes.length, unmatched, ambiguous };
}

export async function syncErpStock(): Promise<SyncSummary> {
  return applyErpFeed(await fetchErpFeed());
}
