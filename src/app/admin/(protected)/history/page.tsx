import Link from "next/link";

import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { relativeTime } from "@/lib/stock";

export const metadata = { title: "Stock History" };

const PAGE_SIZE = 50;

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const currentPage = Math.max(1, Number((await searchParams).page) || 1);

  const [entries, total] = await Promise.all([
    prisma.stockHistory.findMany({
      orderBy: { updatedAt: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        previousQuantity: true,
        newQuantity: true,
        updatedAt: true,
        updatedByName: true,
        dealer: { select: { id: true, dealerName: true } },
      },
    }),
    prisma.stockHistory.count(),
  ]);

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Stock History</h1>
        <p className="text-sm text-muted-foreground">
          Every stock change, oldest kept indefinitely. {total} record
          {total === 1 ? "" : "s"}.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left">
            <tr>
              <th scope="col" className="p-3 font-medium">Dealer</th>
              <th scope="col" className="p-3 text-right font-medium">Previous</th>
              <th scope="col" className="p-3 text-right font-medium">New</th>
              <th scope="col" className="p-3 text-right font-medium">Change</th>
              <th scope="col" className="p-3 font-medium">Updated by</th>
              <th scope="col" className="p-3 font-medium">When</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  No stock updates recorded yet.
                </td>
              </tr>
            ) : (
              entries.map((entry) => {
                const delta = entry.newQuantity - entry.previousQuantity;
                return (
                  <tr key={entry.id} className="hover:bg-muted/30">
                    <td className="max-w-[240px] p-3">
                      <Link
                        href={`/dealers/${entry.dealer.id}`}
                        className="block truncate font-medium hover:underline"
                      >
                        {entry.dealer.dealerName}
                      </Link>
                    </td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">
                      {entry.previousQuantity}
                    </td>
                    <td className="p-3 text-right font-semibold tabular-nums">
                      {entry.newQuantity}
                    </td>
                    <td
                      className={`p-3 text-right font-medium tabular-nums ${
                        delta > 0 ? "text-green-600" : delta < 0 ? "text-red-600" : "text-muted-foreground"
                      }`}
                    >
                      {delta > 0 ? `+${delta}` : delta}
                    </td>
                    <td className="p-3 text-muted-foreground">{entry.updatedByName ?? "Unknown"}</td>
                    <td className="whitespace-nowrap p-3 text-xs text-muted-foreground">
                      <time dateTime={entry.updatedAt.toISOString()}>
                        {relativeTime(entry.updatedAt)}
                      </time>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {lastPage > 1 ? (
        <nav className="flex items-center justify-between" aria-label="Pagination">
          <p className="text-xs text-muted-foreground">
            Page {currentPage} of {lastPage}
          </p>
          <div className="flex gap-2">
            <Button
              render={
                <Link href={`/admin/history?page=${currentPage - 1}`} aria-disabled={currentPage === 1} />
              }
              nativeButton={false}
              variant="outline"
              size="sm"
              className={currentPage === 1 ? "pointer-events-none opacity-50" : ""}
            >
              Previous
            </Button>
            <Button
              render={
                <Link
                  href={`/admin/history?page=${currentPage + 1}`}
                  aria-disabled={currentPage === lastPage}
                />
              }
              nativeButton={false}
              variant="outline"
              size="sm"
              className={currentPage === lastPage ? "pointer-events-none opacity-50" : ""}
            >
              Next
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
