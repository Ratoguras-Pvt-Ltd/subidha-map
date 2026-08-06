"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Info, LocateFixed, Search, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { haversineKm } from "@/lib/geo";
import {
  FILTER_LABELS,
  STATUS_PRESENTATION,
  hasStock,
  matchesFilter,
  type StockFilter,
} from "@/lib/stock";
import type { PublicDealer } from "@/lib/dealers";
import { MapSkeleton } from "@/components/map/map-skeleton";
import { SiteCredit } from "@/components/site-credit";
import { DealerCard } from "./dealer-card";

// Leaflet touches `window` at import time, so it can never be server-rendered.
const DealerMap = dynamic(() => import("@/components/map/dealer-map"), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

const FILTERS: StockFilter[] = ["ALL", "AVAILABLE", "LOW"];

export function DealerExplorer({ dealers }: { dealers: PublicDealer[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StockFilter>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  const cardRefs = useRef(new Map<string, HTMLElement>());

  const totalStock = useMemo(
    () => dealers.reduce((sum, d) => sum + d.stockQuantity, 0),
    [dealers],
  );

  // The public view is only dealers holding cylinders — see hasStock(). Everything
  // below (map pins, cards, filter counts) derives from this one list, so the map and
  // the side panel can never disagree about who is on offer.
  const inStock = useMemo(() => dealers.filter((d) => hasStock(d.status)), [dealers]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const filtered = inStock.filter((d) => {
      if (!matchesFilter(d.status, filter)) return false;
      if (!needle) return true;
      // ponytail: ~391 rows filter instantly in the browser — no search API, no debounce.
      return (
        d.dealerName.toLowerCase().includes(needle) ||
        d.district?.toLowerCase().includes(needle) ||
        d.municipality?.toLowerCase().includes(needle) ||
        d.address?.toLowerCase().includes(needle)
      );
    });

    if (!userLocation) return filtered.map((d) => ({ dealer: d, distanceKm: null }));

    return filtered
      .map((d) => ({
        dealer: d,
        distanceKm: haversineKm(userLocation.lat, userLocation.lng, d.latitude, d.longitude),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [inStock, query, filter, userLocation]);

  const plotted = useMemo(() => visible.map((v) => v.dealer), [visible]);

  // Marker click scrolls the matching card into view.
  useEffect(() => {
    if (!selectedId) return;
    cardRefs.current.get(selectedId)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selectedId]);

  const handleSelect = useCallback((id: string) => setSelectedId(id), []);

  function findNearest() {
    if (!("geolocation" in navigator)) {
      toast.error("Your browser can't share a location.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setLocating(false);
        toast.success("Showing nearest dealers first");
      },
      () => {
        // Denial is a normal outcome, not an error state — the list stays as it was.
        setLocating(false);
        toast.error("Location unavailable. Search by area name instead.");
      },
      { timeout: 10_000, maximumAge: 60_000 },
    );
  }

  const counts = useMemo(() => {
    const by = (f: StockFilter) => inStock.filter((d) => matchesFilter(d.status, f)).length;
    return { ALL: inStock.length, AVAILABLE: by("AVAILABLE"), LOW: by("LOW") };
  }, [inStock]);

  return (
    // flex-1 + min-h-0 rather than calc(100dvh - header): the parent already reserves
    // the header row, so subtracting it again overflowed and gave the page a scrollbar.
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      {/* Map */}
      <div className="relative h-1/2 min-h-[280px] shrink-0 lg:h-full lg:flex-1">
        <DealerMap
          dealers={plotted}
          selectedId={selectedId}
          onSelect={handleSelect}
          userLocation={userLocation}
        />

        {/* With nightly resets, "no pins" is the normal state each morning until
            deliveries are entered — so name it instead of showing a blank map. */}
        {plotted.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 z-[400] grid place-items-center p-6">
            <p className="pointer-events-auto max-w-xs rounded-xl border bg-background/95 p-4 text-center text-sm shadow-lg backdrop-blur">
              <span className="font-semibold">No cylinders available right now</span>
              <span className="mt-1 block text-muted-foreground">
                {dealers.length > 0 && totalStock === 0
                  ? "Today's deliveries have not been recorded yet. Browse the dealer list and call ahead."
                  : "No dealer matches this search with stock in hand. Try a wider area."}
              </span>
            </p>
          </div>
        ) : null}

        <Legend />
      </div>

      {/* List */}
      <aside className="flex min-h-0 flex-1 flex-col border-t bg-background lg:w-[420px] lg:flex-none lg:border-l lg:border-t-0">
        <div className="space-y-3 border-b p-4">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search dealer, city or district…"
              aria-label="Search dealers"
              className="pl-9 pr-9"
            />
            {query ? (
              <button
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by stock">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  filter === f
                    ? "border-red-600 bg-red-600 text-white"
                    : "border-border bg-background hover:bg-muted",
                )}
              >
                {FILTER_LABELS[f]}
                <span className="ml-1.5 opacity-70 tabular-nums">{counts[f]}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2">
            {/* Counts the in-stock set, not the 390-dealer network — the header
                already reports that, and "12 of 390" here would read as a bug. */}
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {visible.length === inStock.length
                ? `${visible.length} dealer${visible.length === 1 ? "" : "s"} with stock today`
                : `${visible.length} of ${inStock.length} with stock today`}
            </p>
            <Button size="sm" variant="outline" onClick={findNearest} disabled={locating}>
              <LocateFixed className={cn("size-3.5", locating && "animate-spin")} aria-hidden />
              {locating ? "Locating…" : "Near me"}
            </Button>
          </div>
        </div>

        {/* Counts are cleared every midnight, so an all-gray map is the normal state
            early in the day, not a broken site. Say which it is. */}
        {totalStock === 0 ? (
          <p className="flex gap-2 border-b bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              Today&apos;s deliveries have not been recorded yet. Counts reset at midnight
              — please call the dealer to confirm before travelling.
            </span>
          </p>
        ) : (
          <p className="flex gap-2 border-b bg-muted/50 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>Figures show cylinders delivered today. Counts reset at midnight.</span>
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {visible.length === 0 ? (
            // Two very different situations: nobody has cylinders yet today, or the
            // search simply matched none of those who do. Don't offer a "reset
            // search" button for the first one — there is nothing to reset.
            <div className="py-12 text-center">
              {inStock.length === 0 ? (
                <>
                  <p className="font-medium">No cylinders available yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Today&apos;s deliveries have not been recorded. Counts reset at
                    midnight, so check back later or call your usual dealer.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium">No dealers match</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Try a different area name or clear the filter.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => {
                      setQuery("");
                      setFilter("ALL");
                    }}
                  >
                    Reset search
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {visible.map(({ dealer, distanceKm }) => (
                <DealerCard
                  key={dealer.id}
                  ref={(node) => {
                    if (node) cardRefs.current.set(dealer.id, node);
                    else cardRefs.current.delete(dealer.id);
                  }}
                  dealer={dealer}
                  distanceKm={distanceKm}
                  isSelected={dealer.id === selectedId}
                  onSelect={() => setSelectedId(dealer.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Outside the scroll container: at the end of a ~391-card list the credit
            would never be seen. */}
        <SiteCredit className="shrink-0 border-t px-4 py-2 text-center text-[11px] text-muted-foreground" />
      </aside>
    </div>
  );
}

// No gray entry: out-of-stock dealers are not plotted, so a key for them would
// describe a pin that never appears.
const LEGEND = [
  ["AVAILABLE", "More than 50", "50+"],
  ["LOW_STOCK", "10 – 50", "10–50"],
  ["CRITICAL", "Fewer than 10", "<10"],
] as const;

/**
 * A floating box is fine on desktop but ate roughly 40% of a 375 px map, so on small
 * screens it collapses to one compact strip along the bottom edge with abbreviated
 * labels.
 */
function Legend() {
  return (
    <div className="absolute inset-x-0 bottom-0 z-[400] border-t bg-background/95 px-3 py-2 text-xs backdrop-blur sm:inset-x-auto sm:bottom-4 sm:left-4 sm:rounded-lg sm:border sm:p-3 sm:shadow-lg">
      <p className="mb-1.5 hidden font-semibold sm:block">Cylinders in stock today</p>
      <ul className="flex items-center justify-between gap-2 sm:flex-col sm:items-start sm:justify-start sm:gap-1">
        {LEGEND.map(([status, label, shortLabel]) => (
          <li key={status} className="flex items-center gap-1.5 sm:gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: STATUS_PRESENTATION[status].hex }}
              aria-hidden
            />
            <span className="text-muted-foreground">
              <span className="sm:hidden">{shortLabel}</span>
              <span className="hidden sm:inline">{label}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
