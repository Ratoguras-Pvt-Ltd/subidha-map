"use server";

import { headers } from "next/headers";
import { revalidatePath, revalidateTag } from "next/cache";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEALERS_TAG } from "@/lib/dealers";
import { deriveStatus } from "@/lib/stock";
import { shouldAlert, sendLowStockAlert } from "@/lib/alerts";
import { dealerSchema, stockUpdateSchema } from "@/lib/validations";
import { MUTATION_LIMIT, clientIp, rateLimit } from "@/lib/rate-limit";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Every mutation goes through here: confirm the session server-side (middleware
 * alone is not an authorisation boundary for Server Actions) and rate-limit by user.
 */
async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in.");

  const ip = clientIp(await headers());
  const limit = rateLimit(`mutate:${session.user.id}:${ip}`, MUTATION_LIMIT);
  if (!limit.ok) throw new Error(`Too many changes at once. Wait ${limit.retryAfter}s.`);

  return { id: session.user.id, name: session.user.name ?? "Unknown" };
}

/** Empty strings from the form become NULL rather than "". */
function blankToNull(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function refreshPublicViews() {
  revalidateTag(DEALERS_TAG);
  revalidatePath("/admin");
  revalidatePath("/admin/dealers");
}

function failure(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

export async function createDealer(formData: FormData): Promise<ActionResult> {
  try {
    await requireAdmin();

    const parsed = dealerSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
    }
    const d = parsed.data;

    await prisma.dealer.create({
      data: {
        // Manually added dealers get a namespaced key so a later KML re-import can't
        // collide with them.
        sourceKey: `manual:${crypto.randomUUID()}`,
        dealerName: d.dealerName,
        address: blankToNull(d.address),
        district: blankToNull(d.district),
        municipality: blankToNull(d.municipality),
        latitude: d.latitude,
        longitude: d.longitude,
        phone: blankToNull(d.phone),
        email: blankToNull(d.email),
        notes: blankToNull(d.notes),
      },
    });

    refreshPublicViews();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function updateDealer(id: string, formData: FormData): Promise<ActionResult> {
  try {
    await requireAdmin();

    const parsed = dealerSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
    }
    const d = parsed.data;

    await prisma.dealer.update({
      where: { id },
      data: {
        dealerName: d.dealerName,
        address: blankToNull(d.address),
        district: blankToNull(d.district),
        municipality: blankToNull(d.municipality),
        latitude: d.latitude,
        longitude: d.longitude,
        phone: blankToNull(d.phone),
        email: blankToNull(d.email),
        notes: blankToNull(d.notes),
        // Stock is deliberately not editable here — it goes through updateStock so
        // that every change lands in StockHistory.
      },
    });

    refreshPublicViews();
    revalidatePath(`/dealers/${id}`);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteDealer(id: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    // StockHistory rows cascade — see the relation in prisma/schema.prisma.
    await prisma.dealer.delete({ where: { id } });

    refreshPublicViews();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function updateStock(formData: FormData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    const parsed = stockUpdateSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the quantity." };
    }
    const { dealerId, newQuantity } = parsed.data;
    const newStatus = deriveStatus(newQuantity);

    // One transaction so a stock change can never exist without its audit row.
    const { previousStatus, dealerName } = await prisma.$transaction(async (tx) => {
      const dealer = await tx.dealer.findUnique({
        where: { id: dealerId },
        select: { stockQuantity: true, status: true, dealerName: true },
      });
      if (!dealer) throw new Error("Dealer not found.");

      await tx.dealer.update({
        where: { id: dealerId },
        data: {
          stockQuantity: newQuantity,
          // The only writer of `status` — keeps it in lockstep with the quantity.
          status: newStatus,
        },
      });

      await tx.stockHistory.create({
        data: {
          dealerId,
          previousQuantity: dealer.stockQuantity,
          newQuantity,
          updatedBy: admin.id,
          updatedByName: admin.name,
        },
      });

      return { previousStatus: dealer.status, dealerName: dealer.dealerName };
    });

    refreshPublicViews();
    revalidatePath("/admin/history");
    revalidatePath(`/dealers/${dealerId}`);

    // Best-effort: a broken/slow notification must never fail or delay the stock
    // save that already committed above.
    if (shouldAlert(previousStatus, newStatus)) {
      prisma.user
        .findMany({ where: { role: "ADMIN" }, select: { email: true, name: true } })
        .then((admins) =>
          sendLowStockAlert({
            dealer: { id: dealerId, dealerName },
            previousStatus,
            newStatus,
            admins,
          }),
        )
        .catch((err) => console.error("[low-stock-alert] failed to send", err));
    }

    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

const TREND_WINDOW_DAYS = 30;

/**
 * A read, not a mutation — checks the session directly rather than going through
 * requireAdmin(), so opening a chart doesn't compete with real edits for the
 * shared mutation rate-limit budget.
 */
export async function getDealerStockHistory(dealerId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in.");

  const since = new Date(Date.now() - TREND_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const rows = await prisma.stockHistory.findMany({
    where: { dealerId, updatedAt: { gte: since } },
    orderBy: { updatedAt: "asc" },
    select: { newQuantity: true, updatedAt: true, updatedBy: true, updatedByName: true },
  });

  return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
}
