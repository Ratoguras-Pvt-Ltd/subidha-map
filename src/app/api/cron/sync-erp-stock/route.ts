import { revalidatePath, revalidateTag } from "next/cache";

import { auth } from "@/lib/auth";
import { DEALERS_TAG } from "@/lib/dealers";
import { syncErpStock } from "@/lib/erp-sync";

// Always a live pull — a cached response would serve an older hour's quantities.
export const dynamic = "force-dynamic";

/**
 * Pulls today's dispatched cylinder counts from the Subidha ERP and writes them onto
 * the matching dealers. Driven by the Vercel Cron entry in vercel.json.
 *
 * Same two ways in as the nightly reset, and nothing else:
 *   1. Vercel Cron, which sends `Authorization: Bearer $CRON_SECRET`.
 *   2. A signed-in admin, so staff can force a refresh and test it.
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

  if (!process.env.CRON_SECRET) {
    console.warn("[erp-sync] CRON_SECRET is not set — scheduled runs are unauthenticated.");
  }

  let summary;
  try {
    summary = await syncErpStock();
  } catch (error) {
    // A missing env var or an ERP that is down must not look like a successful sync, or the
    // map keeps showing this morning's numbers with nobody the wiser.
    const message = error instanceof Error ? error.message : "ERP sync failed.";
    console.error(`[erp-sync] ${message}`);
    return Response.json({ ok: false, error: message }, { status: 502 });
  }

  revalidateTag(DEALERS_TAG);
  revalidatePath("/admin");
  revalidatePath("/admin/history");

  console.log(
    `[erp-sync] ${summary.date}: matched ${summary.matched}, updated ${summary.updated}, ` +
      `unmatched ${summary.unmatched.length}, ambiguous ${summary.ambiguous.length}`,
  );

  return Response.json({ ok: true, ...summary });
}

// Vercel Cron issues GET; POST is here so it can be triggered manually with curl.
export const GET = run;
export const POST = run;
