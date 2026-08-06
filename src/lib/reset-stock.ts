import { prisma } from "./prisma";

// Nepal runs at UTC+05:45 all year — no daylight saving — so midnight in Kathmandu
// is always 18:15 UTC the previous day. That is the schedule in vercel.json, and
// tests/import.test.ts asserts the two agree.
export { RESET_TIMEZONE } from "./stock";

/** Marker used in StockHistory.updatedBy for entries the scheduler wrote. */
export const SYSTEM_ACTOR = "system:nightly-reset";

export type ResetSummary = {
  dealersReset: number;
  cylindersCleared: number;
};

/**
 * Zeroes every dealer's cylinder count.
 *
 * Stock here means "cylinders delivered to this dealer today", not a running
 * inventory — nobody reports what is left on the shelf overnight. Clearing it at
 * midnight means each morning's number is that day's delivery, so a customer
 * reading the map sees what actually arrived rather than a stale cumulative total.
 *
 * The closing count is written to StockHistory *before* being cleared, so the
 * audit trail still shows how many cylinders each dealer had for the day.
 */
export async function resetAllStock(): Promise<ResetSummary> {
  return prisma.$transaction(async (tx) => {
    const stocked = await tx.dealer.findMany({
      where: { stockQuantity: { not: 0 } },
      select: { id: true, stockQuantity: true },
    });

    if (stocked.length === 0) return { dealersReset: 0, cylindersCleared: 0 };

    await tx.stockHistory.createMany({
      data: stocked.map((dealer) => ({
        dealerId: dealer.id,
        previousQuantity: dealer.stockQuantity,
        newQuantity: 0,
        updatedBy: SYSTEM_ACTOR,
        updatedByName: "Nightly reset",
      })),
    });

    await tx.dealer.updateMany({
      where: { stockQuantity: { not: 0 } },
      data: { stockQuantity: 0, status: "OUT_OF_STOCK" },
    });

    return {
      dealersReset: stocked.length,
      cylindersCleared: stocked.reduce((sum, d) => sum + d.stockQuantity, 0),
    };
  });
}
