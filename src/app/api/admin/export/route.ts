import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const COLUMNS = [
  "dealer_name",
  "address",
  "municipality",
  "district",
  "latitude",
  "longitude",
  "phone",
  "email",
  "stock_quantity",
  "status",
  "updated_at",
] as const;

/**
 * Escapes a CSV field. The leading-character guard stops a value like "=cmd" from
 * being executed as a formula when the file is opened in Excel or Sheets.
 */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET() {
  // This route is under /api, which middleware does not match — so it checks the
  // session itself.
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const dealers = await prisma.dealer.findMany({ orderBy: { dealerName: "asc" } });

  const rows = dealers.map((d) =>
    [
      d.dealerName,
      d.address,
      d.municipality,
      d.district,
      d.latitude,
      d.longitude,
      d.phone,
      d.email,
      d.stockQuantity,
      d.status,
      d.updatedAt.toISOString(),
    ]
      .map(csvCell)
      .join(","),
  );

  // BOM so Excel reads the UTF-8 dealer names correctly.
  const csv = `﻿${COLUMNS.join(",")}\n${rows.join("\n")}\n`;
  const date = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="subidha-gas-dealers-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
