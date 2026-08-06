"use client";

import { forwardRef, useState } from "react";
import { Check, Copy, MapPin, Navigation, Phone } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { directionsUrl, formatDistance } from "@/lib/geo";
import { STATUS_PRESENTATION } from "@/lib/stock";
import type { PublicDealer } from "@/lib/dealers";
import { RelativeTime } from "@/components/relative-time";

type Props = {
  dealer: PublicDealer;
  isSelected: boolean;
  distanceKm: number | null;
  onSelect: () => void;
};

export const DealerCard = forwardRef<HTMLElement, Props>(function DealerCard(
  { dealer, isSelected, distanceKm, onSelect },
  ref,
) {
  const [copied, setCopied] = useState(false);
  const presentation = STATUS_PRESENTATION[dealer.status];

  const locality = [dealer.municipality, dealer.district].filter(Boolean).join(", ");
  const addressText = dealer.address ?? locality;

  async function copyAddress(event: React.MouseEvent) {
    event.stopPropagation();
    const text = addressText
      ? `${dealer.dealerName}, ${addressText}`
      : `${dealer.dealerName} (${dealer.latitude}, ${dealer.longitude})`;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Address copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked on insecure origins and in some mobile webviews.
      toast.error("Could not copy — long-press the address to select it.");
    }
  }

  return (
    <article
      ref={ref}
      onClick={onSelect}
      // Selecting a dealer pans the map, so the card has to be reachable by keyboard
      // too — not just by mouse.
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      aria-current={isSelected ? "true" : undefined}
      className={cn(
        "cursor-pointer rounded-xl border bg-card p-4 transition-all",
        "hover:border-red-300 hover:shadow-md dark:hover:border-red-900",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2",
        isSelected
          ? "border-red-500 ring-2 ring-red-500/30 shadow-md dark:border-red-600"
          : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold leading-tight">{dealer.dealerName}</h3>
          {locality ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">{locality}</p>
          ) : null}
        </div>

        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
            presentation.badge,
          )}
        >
          {presentation.label}
        </span>
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold tabular-nums leading-none">
          {dealer.stockQuantity}
        </span>
        <span className="text-sm text-muted-foreground">
          {dealer.stockQuantity === 1 ? "cylinder" : "cylinders"} today
        </span>
      </div>

      {dealer.address ? (
        <p className="mt-3 flex gap-1.5 text-xs text-muted-foreground">
          <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span className="line-clamp-2">{dealer.address}</span>
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {dealer.phone ? (
          <Button
            render={<a href={`tel:${dealer.phone}`} />}
            // Base UI needs telling that this renders an anchor, not a <button>.
            nativeButton={false}
            size="touch"
            variant="default"
            onClick={(e) => e.stopPropagation()}
          >
            <Phone className="size-3.5" aria-hidden />
            Call
          </Button>
        ) : null}

        <Button
          render={
            <a
              href={directionsUrl(dealer.latitude, dealer.longitude)}
              target="_blank"
              rel="noopener noreferrer"
            />
          }
          nativeButton={false}
          size="touch"
          variant="outline"
          onClick={(e) => e.stopPropagation()}
        >
          <Navigation className="size-3.5" aria-hidden />
          Directions
        </Button>

        <Button size="touch" variant="ghost" onClick={copyAddress}>
          {copied ? (
            <Check className="size-3.5 text-green-600" aria-hidden />
          ) : (
            <Copy className="size-3.5" aria-hidden />
          )}
          <span className="sr-only sm:not-sr-only">Copy</span>
        </Button>
      </div>

      <div className="mt-3 flex items-center justify-between border-t pt-2.5 text-xs text-muted-foreground">
        <span>
          Updated <RelativeTime iso={dealer.updatedAt} />
        </span>
        {distanceKm !== null ? (
          <span className="font-medium text-foreground">{formatDistance(distanceKm)}</span>
        ) : null}
      </div>
    </article>
  );
});
