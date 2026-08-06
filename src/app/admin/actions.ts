"use server";

import { headers } from "next/headers";
import { revalidatePath, revalidateTag } from "next/cache";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEALERS_TAG } from "@/lib/dealers";
import { deriveStatus } from "@/lib/stock";
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

    // One transaction so a stock change can never exist without its audit row.
    await prisma.$transaction(async (tx) => {
      const dealer = await tx.dealer.findUnique({
        where: { id: dealerId },
        select: { stockQuantity: true },
      });
      if (!dealer) throw new Error("Dealer not found.");

      await tx.dealer.update({
        where: { id: dealerId },
        data: {
          stockQuantity: newQuantity,
          // The only writer of `status` — keeps it in lockstep with the quantity.
          status: deriveStatus(newQuantity),
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
    });

    refreshPublicViews();
    revalidatePath("/admin/history");
    revalidatePath(`/dealers/${dealerId}`);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
