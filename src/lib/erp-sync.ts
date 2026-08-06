import { prisma } from "./prisma";
import { deriveStatus } from "./stock";

/** Marker written to StockHistory.updatedBy for quantities the ERP pull set. */
export const ERP_ACTOR = "system:erp-sync";

/** One dealer's dispatched total for the day, as the ERP reports it. */
export type ErpDealer = {
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
  /** Feed rows whose ERP id is linked to a dealer here. */
  matched: number;
  /** Of those, the ones whose quantity actually changed (the rest were already correct). */
  updated: number;
  /**
   * Feed rows whose ERP vendor id is not linked to any dealer here, as
   * "name (erp id)" — every one of these is a dealer dispatching cylinders whose
   * stock will never reach the map until somebody links it.
   */
  unlinked: string[];
};

/**
 * Normalised name, used ONLY to propose links in scripts/link-erp-dealers.mts.
 *
 * It is deliberately not part of the sync: the two dealer lists were authored
 * separately, and matching on names resolved 4 of 349 exactly, or under half at its
 * loosest — where it also started colliding, which would credit one dealer's cylinders
 * to another. Names suggest a link for a human to confirm; `Dealer.erpVendorId` is what
 * the sync trusts.
 */
export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()'"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * `nameKey` with the trailing place dropped — ERP names carry one and the map's do not
 * ("Aarti Gas Pasal, Itr" vs "Aarti Gas Pasal"). Raised the proposable links from 4 to
 * 101 with no collisions, so it is the linker's default suggestion.
 */
export function placelessNameKey(name: string): string {
  return nameKey(name.split(/[,(]/)[0]);
}

/**
 * GETs an ERP feed endpoint with the shared secret.
 *
 * `no-store` because the whole point is the current number, and a cached response would
 * quietly serve the previous hour's figure.
 */
async function fetchFromErp<T>(path: (url: URL) => void): Promise<T> {
  const base = process.env.ERP_FEED_URL;
  const secret = process.env.ERP_FEED_SECRET;
  if (!base) throw new Error("ERP_FEED_URL is not set.");
  if (!secret) throw new Error("ERP_FEED_SECRET is not set.");

  const url = new URL(base);
  path(url);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`ERP feed responded ${response.status} ${response.statusText} for ${url.pathname}`);
  }
  return (await response.json()) as T;
}

/** Today's dispatched cylinder counts. */
export async function fetchErpFeed(): Promise<ErpFeed> {
  const feed = await fetchFromErp<ErpFeed>(() => {});
  if (!Array.isArray(feed?.dealers)) {
    throw new Error("ERP feed did not contain a dealers array.");
  }
  return feed;
}

/**
 * The full dealer roster, used only by the linker.
 *
 * Derived from ERP_FEED_URL rather than a second env var — the two endpoints are
 * siblings, so one configured URL is enough and there is no way to set one and forget
 * the other.
 */
export async function fetchErpRoster(): Promise<ErpDealer[]> {
  const body = await fetchFromErp<{ dealers: { id: number; name: string }[] }>((url) => {
    url.pathname = url.pathname.replace(/\/today$/, "/dealers");
  });
  if (!Array.isArray(body?.dealers)) {
    throw new Error("ERP roster did not contain a dealers array.");
  }
  return body.dealers.map((d) => ({ ...d, qty: 0 }));
}

/**
 * Writes the ERP's dispatched quantities onto the dealers linked to those ERP vendor ids.
 *
 * Three deliberate limits:
 *
 *   A dealer with no `erpVendorId` is never written to, even if its name matches
 *   perfectly. Linking is an explicit act; see nameKey()'s note for why names are only
 *   a suggestion.
 *
 *   Quantities are *set*, not added, so re-running the sync in the same day is harmless —
 *   the feed already reports the day's running total per dealer.
 *
 *   Dealers absent from the feed are left exactly as they are, never zeroed. Absent means
 *   "no dispatch recorded yet today", and the nightly reset is what clears yesterday's
 *   numbers. Zeroing here would also wipe any count an admin entered by hand.
 */
export async function applyErpFeed(feed: ErpFeed): Promise<SyncSummary> {
  // Only linked dealers can receive stock, so unlinked rows never leave the database.
  const dealers = await prisma.dealer.findMany({
    where: { erpVendorId: { not: null } },
    select: { id: true, erpVendorId: true, stockQuantity: true },
  });

  // erpVendorId is unique in the schema, so this cannot collide — the ambiguity that
  // name matching suffered from is structurally impossible here.
  const byErpId = new Map(dealers.map((d) => [d.erpVendorId as number, d]));

  const unlinked: string[] = [];
  const changes: { id: string; previousQuantity: number; newQuantity: number }[] = [];
  let matched = 0;

  for (const row of feed.dealers) {
    const dealer = byErpId.get(row.id);
    if (!dealer) {
      unlinked.push(`${row.name} (erp ${row.id})`);
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

  return { date: feed.date, matched, updated: changes.length, unlinked };
}

export async function syncErpStock(): Promise<SyncSummary> {
  return applyErpFeed(await fetchErpFeed());
}
