"use client";

import { useState, useTransition } from "react";
import { TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { StockSparkline, type StockPoint } from "@/components/stock-sparkline";
import { STATUS_PRESENTATION, deriveStatus, relativeTime } from "@/lib/stock";
import { getDealerStockHistory } from "../../actions";

export function DealerTrendSheet({
  dealerId,
  dealerName,
}: {
  dealerId: string;
  dealerName: string;
}) {
  const [points, setPoints] = useState<StockPoint[] | null>(null);
  const [pending, startTransition] = useTransition();

  function load() {
    startTransition(async () => {
      try {
        setPoints(await getDealerStockHistory(dealerId));
      } catch {
        toast.error("Couldn't load stock history.");
      }
    });
  }

  return (
    <Sheet onOpenChange={(open) => open && load()}>
      <SheetTrigger
        render={
          <Button variant="outline" size="sm">
            <TrendingUp className="size-3.5" aria-hidden />
            Trend
          </Button>
        }
      />

      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{dealerName}</SheetTitle>
          <SheetDescription>Last 30 days of cylinder counts.</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
          {pending || points === null ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <StockSparkline points={points} />

              <ul className="divide-y text-sm">
                {[...points].reverse().map((p, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-muted-foreground">{relativeTime(p.updatedAt)}</span>
                    <span className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PRESENTATION[deriveStatus(p.newQuantity)].badge}`}
                      >
                        {p.newQuantity}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {p.updatedByName ?? "Unknown"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
