import "server-only";
import { after } from "next/server";
import * as webpush from "web-push";
import { prisma } from "@server/db/prisma";
import { requireOwnerOrManager } from "@server/auth/permissions";
import type { TenantContext } from "@shared/types/auth.types";
import { appError } from "@shared/errors";
import { buildLowStockMessage, crossedLowStock, type LowStockHit } from "@shared/low-stock";
import { deliverPush } from "@server/services/push-delivery";
import type { Tx } from "@server/services/ledger";

/** Push is optional: without all three settings, every function here is a no-op. */
export function pushConfig(): { publicKey: string; privateKey: string; contact: string } | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const contact = process.env.VAPID_CONTACT_EMAIL;
  return publicKey && privateKey && contact ? { publicKey, privateKey, contact } : null;
}

// ─── Subscriptions (one per browser/device) ─────────────────

export async function savePushSubscription(
  ctx: TenantContext,
  input: { endpoint: string; p256dh: string; auth: string; userAgent?: string },
): Promise<void> {
  requireOwnerOrManager(ctx);
  if (!pushConfig()) throw appError.validationError("Notifications are not set up on this server yet.");
  // A shared phone can switch users: the endpoint is unique, so it moves to whoever is signed in now.
  await prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: { ...input, businessId: ctx.businessId, userId: ctx.userId },
    update: { p256dh: input.p256dh, auth: input.auth, userAgent: input.userAgent, businessId: ctx.businessId, userId: ctx.userId },
  });
}

export async function removePushSubscription(ctx: TenantContext, endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: ctx.userId, businessId: ctx.businessId } });
}

// ─── Low-stock detection (runs inside the stock transaction) ─

/**
 * After a guarded stock decrease, report whether the product just crossed its
 * alert level. Read inside the same transaction so the quantity is exact.
 * Never throws: an alert problem must not fail a sale or stock change.
 */
export async function readLowStockHit(
  tx: Tx,
  productId: string,
  branchId: string,
  removedQuantity: number,
): Promise<LowStockHit | null> {
  try {
    const snap = await tx.stockSnapshot.findUnique({
      where: { productId_branchId: { productId, branchId } },
      select: { quantity: true, product: { select: { name: true, minStockLevel: true } } },
    });
    if (!snap) return null;
    const after = snap.quantity;
    if (!crossedLowStock(after + removedQuantity, after, snap.product.minStockLevel)) return null;
    return { productId, productName: snap.product.name, quantity: after, minStockLevel: snap.product.minStockLevel };
  } catch {
    return null;
  }
}

// ─── Sending ─────────────────────────────────────────────────

async function notifyLowStock(businessId: string, branchId: string, hits: readonly LowStockHit[]): Promise<void> {
  try {
    const cfg = pushConfig();
    if (!cfg || hits.length === 0) return;

    const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { name: true } });
    const payload = buildLowStockMessage(hits, { branchName: branch?.name ?? "", businessId, branchId });
    if (!payload) return;

    // Owners, plus managers who can access this branch. Never staff.
    const members = await prisma.businessMember.findMany({
      where: {
        businessId,
        status: "ACTIVE",
        OR: [{ role: "OWNER" }, { role: "MANAGER", branchAccess: { some: { branchId } } }],
      },
      select: { userId: true },
    });
    if (members.length === 0) return;

    const subs = await prisma.pushSubscription.findMany({
      where: { businessId, userId: { in: members.map((m) => m.userId) } },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    if (subs.length === 0) return;

    webpush.setVapidDetails(`mailto:${cfg.contact}`, cfg.publicKey, cfg.privateKey);
    await deliverPush(
      subs,
      payload,
      (sub, body) => webpush.sendNotification(sub, body, { TTL: 60 * 60 * 24, urgency: "high" }).then(() => undefined),
      async (ids) => {
        await prisma.pushSubscription.deleteMany({ where: { id: { in: ids } } });
      },
    );
  } catch (err) {
    console.error("[push] low-stock notification failed", err);
  }
}

/**
 * Send low-stock alerts after the response has been returned, so notifying never
 * slows down or breaks the sale. Outside a request (tests, scripts) it runs directly.
 */
export function scheduleLowStockAlert(businessId: string, branchId: string, hits: readonly LowStockHit[]): void {
  if (hits.length === 0 || !pushConfig()) return;
  const run = () => notifyLowStock(businessId, branchId, hits);
  try {
    after(run);
  } catch {
    void run();
  }
}