import { unstable_cache } from "next/cache";

import { prisma } from "./prisma";
import type { StockStatus } from "./stock";

/** Exactly the fields the public map and cards need — nothing more leaves the server. */
export type PublicDealer = {
  id: string;
  dealerName: string;
  address: string | null;
  district: string | null;
  municipality: string | null;
  latitude: number;
  longitude: number;
  phone: string | null;
  stockQuantity: number;
  status: StockStatus;
  updatedAt: string;
};

export const DEALERS_TAG = "dealers";

async function queryPublicDealers(): Promise<PublicDealer[]> {
  const rows = await prisma.dealer.findMany({
    select: {
      id: true,
      dealerName: true,
      address: true,
      district: true,
      municipality: true,
      latitude: true,
      longitude: true,
      phone: true,
      stockQuantity: true,
      status: true,
      updatedAt: true,
    },
    orderBy: [{ stockQuantity: "desc" }, { dealerName: "asc" }],
  });

  // Dates are serialised for the client boundary; relativeTime() re-parses them.
  return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
}

/**
 * The whole network is ~391 rows, so one cached query serves the map, the cards and
 * the JSON endpoint. Admin writes call revalidateTag(DEALERS_TAG), which is what
 * makes a stock save show up publicly.
 *
 * ponytail: this ships the whole table to every visitor. Revisit (paginate/search
 * server-side) when dealer count nears ~3,000 or this payload exceeds ~150-200KB
 * gzipped — see the matching note in src/components/dealer/dealer-explorer.tsx.
 */
export const getPublicDealers = unstable_cache(queryPublicDealers, ["public-dealers"], {
  tags: [DEALERS_TAG],
  revalidate: 300,
});
