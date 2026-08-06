import type { MetadataRoute } from "next";

import { getPublicDealers } from "@/lib/dealers";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const dealers = await getPublicDealers();

  return [
    { url: base, changeFrequency: "hourly", priority: 1 },
    ...dealers.map((d) => ({
      url: `${base}/dealers/${d.id}`,
      lastModified: new Date(d.updatedAt),
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
  ];
}
