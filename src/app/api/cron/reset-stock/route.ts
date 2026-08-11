import { revalidatePath, revalidateTag } from "next/cache";

import { auth } from "@/lib/auth";
import { DEALERS_TAG } from "@/lib/dealers";
import { RESET_TIMEZONE, resetAllStock } from "@/lib/reset-stock";

// Zeroing every dealer must never be served from a cache or prerendered.
export const dynamic = "force-dynamic";
// Bound worst case: a hung DB write shouldn't hold the function open indefinitely.
export const maxDuration = 30;

/**
 * Nightly stock reset, driven by the Vercel Cron entry in vercel.json
 * (18:15 UTC = 00:00 Asia/Kathmandu).
 *
 * Two ways in, and nothing else:
 *   1. Vercel Cron, which sends `Authorization: Bearer $CRON_SECRET`.
 *   2. A signed-in admin, so staff can trigger it by hand and test it.
 */
async function authorize(request: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;

  if (secret) {
    const header = request.headers.get("authorization");
    if (header === `Bearer ${secret}`) return true;
  }

  const session = await auth();
  return Boolean(session?.user);
}

async function run(request: Request) {
  if (!(await authorize(request))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Without CRON_SECRET set, the only caller that could ever reach this is a
  // logged-in admin — which is safe, but means the schedule is unprotected in
  // production. Say so loudly in the logs rather than failing silently.
  if (!process.env.CRON_SECRET) {
    console.warn("[reset-stock] CRON_SECRET is not set — scheduled runs are unauthenticated.");
  }

  const summary = await resetAllStock();

  revalidateTag(DEALERS_TAG);
  revalidatePath("/admin");
  revalidatePath("/admin/history");

  const ranAt = new Date().toLocaleString("en-GB", { timeZone: RESET_TIMEZONE });
  console.log(
    `[reset-stock] cleared ${summary.cylindersCleared} cylinders across ` +
      `${summary.dealersReset} dealer(s) at ${ranAt} ${RESET_TIMEZONE}`,
  );

  return Response.json({ ok: true, ranAt, timezone: RESET_TIMEZONE, ...summary });
}

// Vercel Cron issues GET; POST is here so it can be triggered manually with curl.
export const GET = run;
export const POST = run;
