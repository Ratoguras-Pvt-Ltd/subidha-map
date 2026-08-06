import { NextResponse } from "next/server";

import { getPublicDealers } from "@/lib/dealers";

/**
 * Public read-only dealer feed. Shares the tagged cache with the homepage, so an
 * admin stock save invalidates both at once.
 */
export async function GET() {
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
