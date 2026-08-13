import Link from "next/link";
import { AlertTriangle, Boxes, CircleOff, PackageCheck, Store, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { STATUS_PRESENTATION, relativeTime } from "@/lib/stock";

export const metadata = { title: "Dashboard" };

async function getStats() {
  // Two round trips for all five tiles: one grouped count, one sum.
  const [byStatus, totals, recent] = await Promise.all([
    prisma.dealer.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.dealer.aggregate({ _count: { _all: true }, _sum: { stockQuantity: true } }),
    prisma.stockHistory.findMany({
      take: 8,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        previousQuantity: true,
        newQuantity: true,
        updatedAt: true,
        updatedByName: true,
        dealer: { select: { id: true, dealerName: true } },
      },
    }),
  ]);

  const count = (status: string) =>
    byStatus.find((row) => row.status === status)?._count._all ?? 0;

  const available = count("AVAILABLE");
  const low = count("LOW_STOCK") + count("CRITICAL");
  const out = count("OUT_OF_STOCK");

  return {
    totalDealers: totals._count._all,
    totalCylinders: totals._sum.stockQuantity ?? 0,
    // "In stock" is anything a customer could actually buy from today.
    inStock: available + low,
    available,
    low,
    out,
    recent,
  };
}

const TILES = [
  { key: "totalDealers", label: "Total Dealers", icon: Store, tone: "" },
  { key: "totalCylinders", label: "Cylinders Delivered Today", icon: Boxes, tone: "" },
  { key: "inStock", label: "Dealers In Stock", icon: PackageCheck, tone: "text-green-600" },
  { key: "low", label: "Low Stock Dealers", icon: AlertTriangle, tone: "text-yellow-600" },
  { key: "out", label: "Out of Stock", icon: CircleOff, tone: "text-muted-foreground" },
] as const;

export default async function AdminDashboard() {
  const stats = await getStats();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Counts are cylinders delivered today and reset automatically at midnight
          (Nepal time). What you see here is what the public map shows.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {TILES.map(({ key, label, icon: Icon, tone }) => (
          <div key={key} className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <Icon className={`size-4 ${tone || "text-muted-foreground"}`} aria-hidden />
            </div>
            <p className={`mt-2 text-3xl font-bold tabular-nums ${tone}`}>{stats[key]}</p>
          </div>
        ))}
      </div>

      {stats.totalCylinders === 0 ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
          <h2 className="flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-200">
            <AlertTriangle className="size-4" aria-hidden />
            No deliveries recorded today
          </h2>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
            All {stats.totalDealers} dealers are at zero, so the public map shows every
            pin gray. Enter today&apos;s outgoing cylinders per dealer to bring it to life.
          </p>
          <Button
            render={<Link href="/admin/dealers" />}
            nativeButton={false}
            size="sm"
            className="mt-3"
          >
            Record today&apos;s deliveries
          </Button>
        </div>
      ) : null}

      <section className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <TrendingUp className="size-4 text-muted-foreground" aria-hidden />
            Recently updated
          </h2>
          <Button
            render={<Link href="/admin/history" />}
            nativeButton={false}
            variant="ghost"
            size="sm"
          >
            View all
          </Button>
        </div>

        {stats.recent.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No stock updates yet. The first one you save will appear here.
          </p>
        ) : (
          <ul className="divide-y">
            {stats.recent.map((entry) => {
              const delta = entry.newQuantity - entry.previousQuantity;
              return (
                <li key={entry.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/dealers?q=${encodeURIComponent(entry.dealer.dealerName)}`}
                      className="block truncate text-sm font-medium hover:underline"
                    >
                      {entry.dealer.dealerName}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {entry.updatedByName ?? "Unknown"} · {relativeTime(entry.updatedAt)}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm tabular-nums">
                    <span className="text-muted-foreground">{entry.previousQuantity}</span>
                    {" → "}
                    <span className="font-semibold">{entry.newQuantity}</span>
                    <span
                      className={
                        delta > 0 ? "ml-2 text-green-600" : delta < 0 ? "ml-2 text-red-600" : "ml-2"
                      }
                    >
                      {delta > 0 ? `+${delta}` : delta}
                    </span>
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Marker colours:{" "}
        {(["AVAILABLE", "LOW_STOCK", "CRITICAL", "OUT_OF_STOCK"] as const).map((s, i) => (
          <span key={s}>
            {i > 0 ? " · " : ""}
            {STATUS_PRESENTATION[s].dot} {STATUS_PRESENTATION[s].label}
          </span>
        ))}
      </p>
    </div>
  );
}
