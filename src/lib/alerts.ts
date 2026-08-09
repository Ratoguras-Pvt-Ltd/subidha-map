import type { StockStatus } from "./stock";

// Worst to best. A rank *decrease* is a decline in supply, an increase is recovery.
const SEVERITY: Record<StockStatus, number> = {
  OUT_OF_STOCK: 0,
  CRITICAL: 1,
  LOW_STOCK: 2,
  AVAILABLE: 3,
};

/**
 * Fires only when a dealer gets WORSE and lands somewhere low — not on every edit
 * that happens to leave it sitting at LOW_STOCK, and not on a partial recovery like
 * OUT_OF_STOCK -> LOW_STOCK (more cylinders arrived, even if not enough to clear
 * LOW_STOCK — that's good news, not an alert). Comparing against the status already
 * stored on the row (rather than recomputing "was it low before") also means a
 * dealer can never get a second alert until it recovers first.
 */
export function shouldAlert(previousStatus: StockStatus, newStatus: StockStatus): boolean {
  if (newStatus === "AVAILABLE") return false;
  return SEVERITY[newStatus] < SEVERITY[previousStatus];
}

type AlertInput = {
  dealer: { id: string; dealerName: string };
  previousStatus: StockStatus;
  newStatus: StockStatus;
  admins: { email: string; name: string }[];
};

/**
 * No email/SMS provider is wired up yet — provisioning one goes through the Vercel
 * Marketplace, not a hardcoded SDK choice. Until LOW_STOCK_ALERT_WEBHOOK (or whatever
 * env var that integration ends up injecting) is set, this just logs — never throws,
 * since a broken notification must not fail the stock save that triggered it.
 */
export async function sendLowStockAlert({ dealer, previousStatus, newStatus, admins }: AlertInput) {
  if (admins.length === 0) return;

  if (!process.env.LOW_STOCK_ALERT_WEBHOOK) {
    console.log(
      `[low-stock-alert] ${dealer.dealerName} ${previousStatus} -> ${newStatus}, would notify: ${admins.map((a) => a.email).join(", ")}`,
    );
    return;
  }

  await fetch(process.env.LOW_STOCK_ALERT_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dealer, previousStatus, newStatus, admins }),
  });
}
