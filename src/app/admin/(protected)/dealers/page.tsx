import Link from "next/link";
import { Download, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { prisma } from "@/lib/prisma";
import { STATUS_PRESENTATION, relativeTime } from "@/lib/stock";
import { DealerFormDialog } from "./dealer-form-dialog";
import { DealerRowActions } from "./dealer-row-actions";
import { StockDialog } from "./stock-dialog";

export const metadata = { title: "Dealers" };

const PAGE_SIZE = 25;

export default async function DealersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q = "", page = "1" } = await searchParams;
  const currentPage = Math.max(1, Number(page) || 1);

  const where = q
    ? {
        OR: [
          { dealerName: { contains: q, mode: "insensitive" as const } },
          { district: { contains: q, mode: "insensitive" as const } },
          { municipality: { contains: q, mode: "insensitive" as const } },
          { phone: { contains: q } },
        ],
      }
    : {};

  const [dealers, total] = await Promise.all([
    prisma.dealer.findMany({
      where,
      orderBy: { dealerName: "asc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.dealer.count({ where }),
  ]);

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dealers</h1>
          <p className="text-sm text-muted-foreground">
            {total} dealer{total === 1 ? "" : "s"}
            {q ? ` matching “${q}”` : ""}
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            render={<a href="/api/admin/export" />}
            nativeButton={false}
            variant="outline"
            size="sm"
          >
            <Download className="size-3.5" aria-hidden />
            Export CSV
          </Button>
          <DealerFormDialog
            trigger={
              <Button size="sm">
                <Plus className="size-3.5" aria-hidden />
                Add dealer
              </Button>
            }
          />
        </div>
      </div>

      {/* A plain GET form — server-side search needs no client JS. */}
      <form className="flex gap-2" action="/admin/dealers">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Search by name, district or phone…"
          aria-label="Search dealers"
          className="max-w-sm"
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
        {q ? (
          <Button render={<Link href="/admin/dealers" />} nativeButton={false} variant="ghost">
            Clear
          </Button>
        ) : null}
      </form>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left">
            <tr>
              <th scope="col" className="p-3 font-medium">Dealer</th>
              <th scope="col" className="p-3 font-medium">Location</th>
              <th scope="col" className="p-3 font-medium">Phone</th>
              <th scope="col" className="p-3 text-right font-medium">Stock</th>
              <th scope="col" className="p-3 font-medium">Status</th>
              <th scope="col" className="p-3 font-medium">Updated</th>
              <th scope="col" className="p-3 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {dealers.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  No dealers found.
                </td>
              </tr>
            ) : (
              dealers.map((dealer) => (
                <tr key={dealer.id} className="hover:bg-muted/30">
                  <td className="max-w-[220px] p-3">
                    <Link
                      href={`/dealers/${dealer.id}`}
                      className="block truncate font-medium hover:underline"
                    >
                      {dealer.dealerName}
                    </Link>
                  </td>
                  <td className="max-w-[200px] p-3 text-muted-foreground">
                    <span className="block truncate">
                      {[dealer.municipality, dealer.district].filter(Boolean).join(", ") || "—"}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {dealer.phone ? (
                      <a href={`tel:${dealer.phone}`} className="hover:underline">
                        {dealer.phone}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-3 text-right font-semibold tabular-nums">
                    {dealer.stockQuantity}
                  </td>
                  <td className="p-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PRESENTATION[dealer.status].badge}`}
                    >
                      {STATUS_PRESENTATION[dealer.status].label}
                    </span>
                  </td>
                  <td className="whitespace-nowrap p-3 text-xs text-muted-foreground">
                    {relativeTime(dealer.updatedAt)}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      <StockDialog
                        dealerId={dealer.id}
                        dealerName={dealer.dealerName}
                        currentQuantity={dealer.stockQuantity}
                      />
                      <DealerRowActions
                        dealer={{
                          id: dealer.id,
                          dealerName: dealer.dealerName,
                          address: dealer.address,
                          district: dealer.district,
                          municipality: dealer.municipality,
                          latitude: dealer.latitude,
                          longitude: dealer.longitude,
                          phone: dealer.phone,
                          email: dealer.email,
                          notes: dealer.notes,
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))
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
                <Link
                  href={`/admin/dealers?${new URLSearchParams({ q, page: String(currentPage - 1) })}`}
                  aria-disabled={currentPage === 1}
                />
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
                  href={`/admin/dealers?${new URLSearchParams({ q, page: String(currentPage + 1) })}`}
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
