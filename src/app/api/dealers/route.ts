import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getPublicDealers } from "@/lib/dealers";

/**
 * Admin-only dealer feed — the public map gets its data from getPublicDealers()
 * directly in page.tsx, not through this route, so nothing breaks by gating it.
 * This is under /api, which middleware does not match, so it checks the session
 * itself (same pattern as /api/admin/export).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dealers = await getPublicDealers();

  return NextResponse.json(
    { count: dealers.length, dealers },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    },
  );
}
