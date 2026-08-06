"use client";

import dynamic from "next/dynamic";
import type { CSSProperties } from "react";
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

// Fractions of the column below the header. Three stops: enough map to keep your
// bearings, an even split, and effectively the whole list.
//
// 0.48 rather than a plain third: the search block plus the drag handle is around
// 200px of furniture before the first card, so 0.48 of a ~790px column (iPhone 14)
// clears a whole card; on a short 640px-tall phone it still clears the card's name,
// badge and cylinder count with one tap to the next stop. Every consumer of this is
// `lg:`-gated, so above that breakpoint it is inert and the desktop panel is
// unaffected by these numbers.
const SNAPS = [0.48, 0.75, 0.96] as const;

export function DealerExplorer({ dealers }: { dealers: PublicDealer[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StockFilter>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [snap, setSnap] = useState(0);

  const cardRefs = useRef(new Map<string, HTMLElement>());
  const shellRef = useRef<HTMLDivElement>(null);
  // Drag state lives on refs, not React state: re-rendering ~150 dealer cards on
  // every pointermove drops the gesture to ~15fps on a mid-range phone. The handlers
  // below write --sheet-drag straight onto the shell's style and only tell React
  // about it once, on release.
  const dragRef = useRef<{ y0: number; h0: number; box: number } | null>(null);
  const movedRef = useRef(false);

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

  // This document never scrolls — the shell is `fixed inset-0`, and the dealer list
  // is the only intended scroll region (see page.tsx). Some mobile browsers don't
  // know that: focusing the search input near an on-screen keyboard makes them try
  // to scroll the whole page to keep it visible, which shoves the sheet (search bar
  // included) up past the top of the screen. Snapping window scroll back to 0 is
  // always correct here, since nothing should ever have moved it in the first place.
  useEffect(() => {
    const resetScroll = () => {
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };
    window.visualViewport?.addEventListener("resize", resetScroll);
    window.addEventListener("scroll", resetScroll, { passive: true });
    return () => {
      window.visualViewport?.removeEventListener("resize", resetScroll);
      window.removeEventListener("scroll", resetScroll);
    };
  }, []);

  // Picking a dealer — map pin or card, same state — drops the sheet to peek so the
  // pin the map just flew to is actually on screen, then scrolls the matching card
  // into view.
  useEffect(() => {
    if (!selectedId) return;
    setSnap(0);
    // `block: "start"`, not "center": the sheet is mid-way through a 300ms height
    // transition, and only "start" resolves to the same scrollTop before and after it.
    cardRefs.current.get(selectedId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedId]);

  const handleSelect = useCallback((id: string) => setSelectedId(id), []);

  function onHandleDown(event: React.PointerEvent<HTMLButtonElement>) {
    const box = shellRef.current?.clientHeight ?? 0;
    if (!box) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { y0: event.clientY, h0: SNAPS[snap] * box, box };
    movedRef.current = false;
    shellRef.current!.dataset.dragging = "";
  }

  function onHandleMove(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const dy = event.clientY - drag.y0;
    if (Math.abs(dy) > 6) movedRef.current = true; // a tap is not a drag
    const height = Math.min(
      Math.max(drag.h0 - dy, SNAPS[0] * drag.box),
      SNAPS[SNAPS.length - 1] * drag.box,
    );
    shellRef.current!.style.setProperty("--sheet-drag", `${height}px`);
  }

  function onHandleUp(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    const shell = shellRef.current!;
    delete shell.dataset.dragging;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (!movedRef.current) return; // a tap — onClick cycles instead

    const fraction = parseFloat(shell.style.getPropertyValue("--sheet-drag")) / drag.box;
    // --sheet-drag is only an override. Removing it hands the height back to
    // --sheet-h, which React owns, so the two writers can never disagree.
    shell.style.removeProperty("--sheet-drag");
    setSnap(
      SNAPS.reduce(
        (best, s, i) => (Math.abs(s - fraction) < Math.abs(SNAPS[best] - fraction) ? i : best),
        0,
      ),
    );
  }

  function cycleSheet() {
    if (!movedRef.current) setSnap((s) => (s + 1) % SNAPS.length);
  }

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

  // Shared by the desktop count row and the mobile drag handle, which doubles as
  // the sheet's title and gives the handle its accessible name.
  const resultCountText = useMemo(
    () =>
      // Counts the in-stock set, not the 390-dealer network — the header already
      // reports that, and "12 of 390" here would read as a bug.
      visible.length === inStock.length
        ? `${visible.length} dealer${visible.length === 1 ? "" : "s"} with stock today`
        : `${visible.length} of ${inStock.length} with stock today`,
    [visible.length, inStock.length],
  );

  return (
    // --sheet-h / --sheet-drag drive the sheet's height below `lg`; every consumer
    // of them is `lg:`-gated (lg:static, lg:h-full…), so above that breakpoint both
    // variables are inert and the desktop split needs no media-query hook.
    // --sheet-h is the settled snap (React owns it); --sheet-drag is the live value
    // while a finger is on the handle (the DOM owns it — see onHandleMove/onHandleUp).
    <div
      ref={shellRef}
      style={{ "--sheet-h": `${SNAPS[snap] * 100}%` } as CSSProperties}
      className="group/shell relative flex min-h-0 flex-1 flex-col lg:flex-row"
    >
      {/* Map — full height below `lg`, the sheet overlays it rather than sharing
          the flexbox, so dragging the sheet never resizes the map container. */}
      <div className="relative h-full shrink-0 lg:flex-1">
        <DealerMap
          dealers={plotted}
          selectedId={selectedId}
          onSelect={handleSelect}
          userLocation={userLocation}
          sheetPeek={SNAPS[0]}
        />

        {/* With nightly resets, "no pins" is the normal state each morning until
            deliveries are entered — so name it instead of showing a blank map.
            Bottom tracks the sheet so the message centres in the visible band. */}
        {plotted.length === 0 ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 bottom-[var(--sheet-drag,var(--sheet-h))] z-[400] grid place-items-center p-6 lg:bottom-0">
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

      {/* List — a draggable bottom sheet below `lg`; the original static 420px
          side panel at `lg` and up. */}
      <aside
        aria-label="Dealers with cylinders today"
        className={cn(
          "absolute inset-x-0 bottom-0 z-[500] flex min-h-0 flex-col rounded-t-2xl border-t bg-background pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_20px_-6px_rgb(0_0_0/0.35)]",
          "h-[var(--sheet-drag,var(--sheet-h))] transition-[height] duration-300 ease-out",
          "group-data-[dragging]/shell:transition-none motion-reduce:transition-none",
          "lg:static lg:h-full lg:w-[420px] lg:flex-none lg:rounded-none lg:border-l lg:border-t-0 lg:pb-0 lg:shadow-none lg:transition-none",
        )}
      >
        {/* Drag to resize, tap to cycle the three stops, ArrowUp/ArrowDown from a
            keyboard. touch-none stops the browser claiming the gesture as a page
            scroll before pointermove fires. No handle at `lg` — the panel is a
            fixed column there. */}
        <button
          type="button"
          aria-expanded={snap === SNAPS.length - 1}
          aria-controls="dealer-list"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          onClick={cycleSheet}
          onKeyDown={(event) => {
            const step = event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? -1 : 0;
            if (!step) return;
            event.preventDefault();
            setSnap((s) => Math.min(Math.max(s + step, 0), SNAPS.length - 1));
          }}
          className="flex shrink-0 touch-none select-none flex-col items-center gap-1 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
        >
          <span className="h-1 w-10 rounded-full bg-muted-foreground/40" aria-hidden />
          <span className="text-xs text-muted-foreground">{resultCountText}</span>
        </button>

        <div className="shrink-0 space-y-2 border-b p-3 lg:space-y-3 lg:p-4">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground lg:left-3"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setSnap(SNAPS.length - 1)}
              placeholder="Search dealer, city or district…"
              aria-label="Search dealers"
              className="h-11 pl-10 pr-12 text-base lg:h-8 lg:pl-9 lg:pr-9 lg:text-sm"
            />
            {query ? (
              <button
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted lg:right-2 lg:size-6"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>

          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Filter by stock"
          >
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={cn(
                  // px-3, not px-4: three chips plus the icon-only "Near me" button
                  // must all fit one row at 360px — measured, px-4 pushed them onto
                  // a second row and cost ~50px of peek space nobody planned for.
                  "inline-flex h-11 items-center rounded-full border px-3 text-sm font-medium transition-colors lg:h-auto lg:py-1 lg:text-xs",
                  filter === f
                    ? "border-red-600 bg-red-600 text-white"
                    : "border-border bg-background hover:bg-muted",
                )}
              >
                {FILTER_LABELS[f]}
                <span className="ml-1.5 opacity-70 tabular-nums">{counts[f]}</span>
              </button>
            ))}

            {/* Same "Near me" as the desktop row below, duplicated rather than
                repositioned with CSS — same technique Legend uses for its label
                swap — so the desktop row stays exactly as it was. Icon-only: even
                with the tighter chip padding above, a labelled button here doesn't
                fit a 360px row without wrapping. */}
            <Button
              size="touch"
              variant="outline"
              onClick={findNearest}
              disabled={locating}
              aria-label={locating ? "Locating…" : "Near me"}
              className="ml-auto shrink-0 px-3 lg:hidden"
            >
              <LocateFixed className={cn("size-4", locating && "animate-spin")} aria-hidden />
            </Button>
          </div>

          <div className="hidden items-center justify-between gap-2 lg:flex">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {resultCountText}
            </p>
            <Button size="sm" variant="outline" onClick={findNearest} disabled={locating}>
              <LocateFixed className={cn("size-3.5", locating && "animate-spin")} aria-hidden />
              {locating ? "Locating…" : "Near me"}
            </Button>
          </div>
        </div>

        {/* Counts are cleared every midnight, so an all-gray map is the normal state
            early in the day, not a broken site. Say which it is. The muted banner
            below is boilerplate and costs peek space that isn't worth it on a
            phone, so it only shows at `lg`; the amber one is actionable and stays
            on every screen. */}
        {totalStock === 0 ? (
          <p className="flex shrink-0 gap-2 border-b bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              Today&apos;s deliveries have not been recorded yet. Counts reset at midnight
              — please call the dealer to confirm before travelling.
            </span>
          </p>
        ) : (
          <p className="hidden shrink-0 gap-2 border-b bg-muted/50 p-3 text-xs text-muted-foreground lg:flex">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>Figures show cylinders delivered today. Counts reset at midnight.</span>
          </p>
        )}

        <div
          id="dealer-list"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 lg:p-4"
        >
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
                    size="touch"
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

          {/* Pinned outside this scroll container at `lg` (below); inside it on
              mobile, where the sheet has no room to spare on a fixed footer. */}
          <SiteCredit className="mt-3 border-t px-1 py-2 text-center text-[11px] text-muted-foreground lg:hidden" />
        </div>

        <SiteCredit className="hidden shrink-0 border-t px-4 py-2 text-center text-[11px] text-muted-foreground lg:block" />
      </aside>
    </div>
  );
}

// No gray entry: out-of-stock dealers are not plotted, so a key for them would
// describe a pin that never appears.
const LEGEND = [
  ["AVAILABLE", "More than 50"],
  ["LOW_STOCK", "10 – 50"],
  ["CRITICAL", "Fewer than 10"],
] as const;

/**
 * Desktop only. On a phone the marker already prints its own cylinder count
 * (dealer-map.tsx), so a colour key restating "10–50" is redundant there — and the
 * bottom strip it used to occupy now belongs to the dealer sheet and to
 * OpenStreetMap's required attribution.
 */
function Legend() {
  return (
    <div className="absolute bottom-4 left-4 z-[400] hidden rounded-lg border bg-background/95 p-3 text-xs shadow-lg backdrop-blur lg:block">
      <p className="mb-1.5 font-semibold">Cylinders in stock today</p>
      <ul className="flex flex-col items-start gap-1">
        {LEGEND.map(([status, label]) => (
          <li key={status} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: STATUS_PRESENTATION[status].hex }}
              aria-hidden
            />
            <span className="text-muted-foreground">{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
