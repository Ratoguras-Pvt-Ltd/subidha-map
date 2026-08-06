/**
 * Mirrors the StockStatus enum in prisma/schema.prisma. Declared here rather than
 * imported from the generated client so this module stays pure — the tests can
 * exercise the thresholds without a database or a `prisma generate` first.
 * ponytail: a 4-member string union, not a generated-type import.
 */
export type StockStatus = "AVAILABLE" | "LOW_STOCK" | "CRITICAL" | "OUT_OF_STOCK";

/**
 * The ONLY place a cylinder count is compared to a threshold.
 *
 * Marker colours, badges, dashboard tiles, filters and the `status` column all
 * derive from here — nothing else in the codebase may hardcode 10 or 50.
 *
 *   0      → OUT_OF_STOCK  (gray)
 *   1–9    → CRITICAL      (red)    "less than 10"
 *   10–50  → LOW_STOCK     (yellow)
 *   51+    → AVAILABLE     (green)  "more than 50"
 */
export function deriveStatus(quantity: number): StockStatus {
  if (quantity <= 0) return "OUT_OF_STOCK";
  if (quantity < 10) return "CRITICAL";
  if (quantity <= 50) return "LOW_STOCK";
  return "AVAILABLE";
}

/**
 * Cylinder counts are cleared nightly at midnight in this zone — Nepal is a fixed
 * UTC+05:45 with no DST. Lives here (rather than beside the reset logic) so it can
 * be read without pulling in the database client.
 */
export const RESET_TIMEZONE = "Asia/Kathmandu";

/**
 * Whether a dealer is shown to the public at all — both as a map pin and as a card
 * in the side panel.
 *
 * A customer is looking for somewhere to buy gas today. 380-odd entries for dealers
 * with nothing to sell bury the handful that can actually help, so they are omitted
 * from the public view entirely. The dealer count in the header still reports the
 * full network, and staff see every dealer in the admin dashboard.
 */
export function hasStock(status: StockStatus): boolean {
  return status !== "OUT_OF_STOCK";
}

/**
 * The buckets the public filter bar exposes. There is deliberately no "Out of Stock"
 * filter, because out-of-stock dealers are not in the public view at all — see
 * hasStock().
 */
export type StockFilter = "ALL" | "AVAILABLE" | "LOW";

/**
 * Four statuses collapse into two positive filters: a red (CRITICAL) dealer and a
 * yellow (LOW_STOCK) dealer both answer "who is running low?".
 */
export function matchesFilter(status: StockStatus, filter: StockFilter): boolean {
  switch (filter) {
    case "ALL":
      return true;
    case "AVAILABLE":
      return status === "AVAILABLE";
    case "LOW":
      return status === "LOW_STOCK" || status === "CRITICAL";
  }
}

type StatusPresentation = {
  label: string;
  dot: string;
  /** Hex, because Leaflet divIcons are built as raw HTML strings outside Tailwind's reach. */
  hex: string;
  /** Tailwind classes for the card badge. */
  badge: string;
};

export const STATUS_PRESENTATION: Record<StockStatus, StatusPresentation> = {
  AVAILABLE: {
    label: "Available",
    dot: "🟢",
    hex: "#16a34a",
    badge: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  },
  LOW_STOCK: {
    label: "Low Stock",
    dot: "🟡",
    hex: "#ca8a04",
    badge: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  },
  CRITICAL: {
    label: "Critical",
    dot: "🔴",
    hex: "#dc2626",
    badge: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  },
  OUT_OF_STOCK: {
    label: "Out of Stock",
    dot: "⚫",
    hex: "#6b7280",
    badge: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  },
};

export const FILTER_LABELS: Record<StockFilter, string> = {
  // "All" means all dealers holding cylinders today, since that is the whole of the
  // public view — not the full 390-dealer network.
  ALL: "All",
  AVAILABLE: "Available",
  LOW: "Low Stock",
};

/**
 * "15 minutes ago" via Intl — no date library.
 * ponytail: Intl.RelativeTimeFormat covers every unit we show; date-fns would be
 * 20 kB for one string.
 */
export function relativeTime(date: Date | string): string {
  const then = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.round((Date.now() - then.getTime()) / 1000);

  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const divisions: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.34524, "week"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];

  let value = seconds;
  for (const [span, unit] of divisions) {
    if (Math.abs(value) < span) return rtf.format(-Math.round(value), unit);
    value /= span;
  }
  return rtf.format(-Math.round(value), "year");
}
