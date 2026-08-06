import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Navigation, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { getPublicDealers } from "@/lib/dealers";
import { directionsUrl } from "@/lib/geo";
import { STATUS_PRESENTATION, relativeTime } from "@/lib/stock";

// A single interactive map is invisible to crawlers. These per-dealer pages are what
// actually gets Subidha Gas into "gas dealer near <place>" results.
export const revalidate = 300;

async function findDealer(id: string) {
  const dealers = await getPublicDealers();
  return dealers.find((d) => d.id === id) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const dealer = await findDealer((await params).id);
  if (!dealer) return { title: "Dealer not found" };

  const where = [dealer.municipality, dealer.district].filter(Boolean).join(", ");
  const status = STATUS_PRESENTATION[dealer.status].label;

  return {
    title: `${dealer.dealerName}${where ? ` — ${where}` : ""}`,
    description: `${dealer.dealerName}${where ? ` in ${where}` : ""}: ${status}, ${dealer.stockQuantity} Subidha Gas cylinders in stock. Address, phone number and directions.`,
    alternates: { canonical: `/dealers/${dealer.id}` },
  };
}

export default async function DealerPage({ params }: { params: Promise<{ id: string }> }) {
  const dealer = await findDealer((await params).id);
  if (!dealer) notFound();

  const presentation = STATUS_PRESENTATION[dealer.status];
  const where = [dealer.municipality, dealer.district].filter(Boolean).join(", ");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "GasStation",
    name: dealer.dealerName,
    description: `Authorised Subidha Gas LPG cylinder dealer${where ? ` in ${where}` : ""}.`,
    ...(dealer.address || where
      ? {
          address: {
            "@type": "PostalAddress",
            streetAddress: dealer.address ?? undefined,
            addressLocality: dealer.municipality ?? undefined,
            addressRegion: dealer.district ?? undefined,
            addressCountry: "NP",
          },
        }
      : {}),
    geo: {
      "@type": "GeoCoordinates",
      latitude: dealer.latitude,
      longitude: dealer.longitude,
    },
    ...(dealer.phone ? { telephone: `+977${dealer.phone}` } : {}),
    brand: { "@type": "Brand", name: "Subidha Gas" },
  };

  return (
    <div className="min-h-dvh">
      <SiteHeader />

      <main className="mx-auto max-w-2xl px-4 py-8">
        <Button
          render={<Link href="/" />}
          nativeButton={false}
          variant="ghost"
          size="sm"
          className="mb-6 -ml-2"
        >
          <ArrowLeft className="size-4" aria-hidden />
          All dealers
        </Button>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{dealer.dealerName}</h1>
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${presentation.badge}`}>
            {presentation.label}
          </span>
        </div>

        {where ? <p className="mt-1 text-muted-foreground">{where}</p> : null}

        <div className="mt-6 rounded-xl border p-5">
          <p className="text-sm text-muted-foreground">Cylinders available</p>
          <p className="mt-1 text-4xl font-bold tabular-nums">{dealer.stockQuantity}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Last updated {relativeTime(dealer.updatedAt)}. Call ahead to confirm before
            travelling.
          </p>
        </div>

        <dl className="mt-6 space-y-4 text-sm">
          {dealer.address ? (
            <div className="flex gap-3">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div>
                <dt className="font-medium">Address</dt>
                <dd className="text-muted-foreground">{dealer.address}</dd>
              </div>
            </div>
          ) : null}

          {dealer.phone ? (
            <div className="flex gap-3">
              <Phone className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div>
                <dt className="font-medium">Phone</dt>
                <dd>
                  <a className="text-red-600 hover:underline" href={`tel:${dealer.phone}`}>
                    {dealer.phone}
                  </a>
                </dd>
              </div>
            </div>
          ) : null}
        </dl>

        <Button
          render={
            <a
              href={directionsUrl(dealer.latitude, dealer.longitude)}
              target="_blank"
              rel="noopener noreferrer"
            />
          }
          nativeButton={false}
          className="mt-8 w-full sm:w-auto"
        >
          <Navigation className="size-4" aria-hidden />
          Get directions
        </Button>
      </main>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}
