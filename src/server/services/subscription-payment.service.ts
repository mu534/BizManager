/**
 * Manual subscription payments (Telebirr / bank transfer) — SERVER ONLY.
 *
 * BizManager does NOT verify transfers automatically and no gateway is used.
 *
 *   owner submits  ──▶  PENDING  ──▶  APPROVED  (grants a subscription period)
 *                                └──▶  REJECTED  (reason shown; owner may resubmit)
 *
 * Guarantees:
 *  - Only an owner may submit; only a platform admin (FINANCE / SUPER_ADMIN)
 *    may approve or reject. Clients never set status, amount or period.
 *  - The amount is computed server-side from the plan's stored price.
 *  - Approval is idempotent and race-safe: the PENDING → APPROVED transition is
 *    a single guarded UPDATE, so retries or two reviewers cannot grant two
 *    periods or approve twice.
 *  - Pending evidence never activates anything by itself.
 *  - Every review is audited in the same transaction.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { SubscriptionPayment } from "@prisma/client";
import { prisma } from "@server/db/prisma";
import { appError } from "@shared/errors";
import type { TenantContext } from "@shared/types/auth.types";
import { requireOwner } from "@server/auth/permissions";
import {
  requirePlatformAdmin,
  writePlatformAudit,
  type PlatformAdminContext,
} from "@server/services/platform-admin.service";
import { deleteEvidenceQuietly, evidenceKeyFor, saveEvidence } from "@server/storage/evidence-storage";
import { checkEvidenceFile, normalizeReference } from "@shared/payment-evidence";
import { priceForPeriod, isPlanCode } from "@shared/plans";
import { billingMonths, computeNextPeriod } from "@shared/subscription-access";
import type { SubmitPaymentInput } from "@shared/validation/subscription.schema";

/** Abuse guard: submissions per business in a rolling 24 h window. */
export const MAX_SUBMISSIONS_PER_DAY = 5;

export interface PurchasablePlan {
  id: string;
  code: string;
  displayName: string;
  currency: string;
  monthlyPriceMinor: number;
  yearlyPriceMinor: number;
  annualDiscountBps: number;
}

export async function listPurchasablePlans(): Promise<PurchasablePlan[]> {
  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  return plans
    .filter((p) => isPlanCode(p.name))
    .map((p) => {
      const pricing = { monthlyPriceMinor: p.monthlyPriceMinor, annualDiscountBps: p.annualDiscountBps };
      return {
        id: p.id,
        code: p.name,
        displayName: p.displayName,
        currency: p.currency,
        monthlyPriceMinor: p.monthlyPriceMinor,
        yearlyPriceMinor: priceForPeriod(pricing, "YEARLY"),
        annualDiscountBps: p.annualDiscountBps,
      };
    });
}

// ─── Submission (owner) ───────────────────────────────────────────────────

export async function submitSubscriptionPayment(
  ctx: TenantContext,
  input: SubmitPaymentInput,
  file: Uint8Array,
): Promise<SubscriptionPayment> {
  requireOwner(ctx);

  const check = checkEvidenceFile(file);
  if (!check.ok) {
    const msg =
      check.reason === "TOO_LARGE"
        ? "The receipt file is too large (maximum 4 MB)."
        : check.reason === "EMPTY"
          ? "The receipt file is empty."
          : "Upload a JPG, PNG, WebP or PDF receipt.";
    throw appError.validationError(msg);
  }

  const plan = await prisma.plan.findUnique({ where: { name: input.planCode } });
  if (!plan || !plan.isActive) throw appError.validationError("That plan is not available.");

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [pending, recent] = await Promise.all([
    prisma.subscriptionPayment.findFirst({
      where: { businessId: ctx.businessId, status: "PENDING" },
      select: { id: true },
    }),
    prisma.subscriptionPayment.count({
      where: { businessId: ctx.businessId, createdAt: { gte: since } },
    }),
  ]);
  if (pending) {
    throw appError.conflict(
      "You already have a payment waiting for review. Please wait for it to be approved or rejected.",
    );
  }
  if (recent >= MAX_SUBMISSIONS_PER_DAY) {
    throw appError.conflict("Too many submissions today. Please try again tomorrow or contact support.");
  }

  const amountMinor = priceForPeriod(
    { monthlyPriceMinor: plan.monthlyPriceMinor, annualDiscountBps: plan.annualDiscountBps },
    input.billingPeriod,
  );

  const id = randomUUID();
  const key = evidenceKeyFor(ctx.businessId, id, check.extension);
  await saveEvidence(key, file, check.kind);

  try {
    return await prisma.subscriptionPayment.create({
      data: {
        id,
        businessId: ctx.businessId,
        planId: plan.id,
        billingPeriod: input.billingPeriod,
        amountMinor,
        currency: plan.currency,
        method: input.method,
        reference: input.reference.trim(),
        referenceNormalized: normalizeReference(input.reference),
        evidenceKey: key,
        evidenceContentType: check.kind,
        evidenceBytes: file.length,
        submittedById: ctx.userId,
      },
    });
  } catch (err) {
    await deleteEvidenceQuietly(key);
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Partial unique indexes: one pending per business / reference already in use.
      throw appError.conflict(
        "This transaction reference has already been submitted, or you already have a payment waiting for review.",
      );
    }
    throw err;
  }
}

export async function listBusinessPayments(ctx: TenantContext): Promise<SubscriptionPayment[]> {
  requireOwner(ctx);
  return prisma.subscriptionPayment.findMany({
    where: { businessId: ctx.businessId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

// ─── Review (platform admin) ──────────────────────────────────────────────

export async function listPendingPayments() {
  await requirePlatformAdmin(["FINANCE"]);
  return prisma.subscriptionPayment.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: {
      business: { select: { id: true, name: true } },
      plan: { select: { displayName: true } },
      submittedBy: { select: { name: true, email: true } },
    },
  });
}

export async function listRecentReviewedPayments() {
  await requirePlatformAdmin(["FINANCE"]);
  return prisma.subscriptionPayment.findMany({
    where: { status: { in: ["APPROVED", "REJECTED"] } },
    orderBy: { reviewedAt: "desc" },
    take: 25,
    include: {
      business: { select: { name: true } },
      plan: { select: { displayName: true } },
    },
  });
}

export interface ApprovalResult {
  paymentId: string;
  periodStart: Date;
  periodEnd: Date;
  /** True when this call performed the approval; false when it was already approved. */
  applied: boolean;
}

/**
 * Approve a pending payment and grant the subscription period.
 * Safe to retry: a second call for an already-approved payment returns the
 * original result without extending the subscription again.
 */
export async function approvePayment(
  admin: PlatformAdminContext,
  paymentId: string,
  now: Date = new Date(),
): Promise<ApprovalResult> {
  if (admin.role !== "SUPER_ADMIN" && admin.role !== "FINANCE") {
    throw appError.forbidden("Your platform role cannot approve payments.");
  }

  return prisma.$transaction(async (tx) => {
    const payment = await tx.subscriptionPayment.findUnique({ where: { id: paymentId } });
    if (!payment) throw appError.notFound("Payment not found.");

    if (payment.status === "APPROVED" && payment.periodStart && payment.periodEnd) {
      return { paymentId, periodStart: payment.periodStart, periodEnd: payment.periodEnd, applied: false };
    }
    if (payment.status === "REJECTED") {
      throw appError.conflict("This payment was already rejected. Ask the customer to resubmit.");
    }

    const existing = await tx.subscription.findUnique({ where: { businessId: payment.businessId } });
    const months = billingMonths(payment.billingPeriod);
    const { start, end } = computeNextPeriod(existing?.currentPeriodEnd ?? null, months, now);

    // The race-safe gate: only one caller can flip PENDING → APPROVED.
    const flipped = await tx.subscriptionPayment.updateMany({
      where: { id: paymentId, status: "PENDING" },
      data: {
        status: "APPROVED",
        reviewedById: admin.userId,
        reviewedAt: now,
        periodStart: start,
        periodEnd: end,
      },
    });
    if (flipped.count === 0) {
      throw appError.conflict("This payment was just reviewed by someone else. Refresh to see the result.");
    }

    await tx.subscription.upsert({
      where: { businessId: payment.businessId },
      create: {
        businessId: payment.businessId,
        planId: payment.planId,
        status: "ACTIVE",
        billingPeriod: payment.billingPeriod,
        currentPeriodStart: start,
        currentPeriodEnd: end,
      },
      update: {
        planId: payment.planId,
        status: "ACTIVE",
        billingPeriod: payment.billingPeriod,
        trialEndsAt: null,
        cancelledAt: null,
        currentPeriodStart: start,
        currentPeriodEnd: end,
      },
    });

    await writePlatformAudit(tx, {
      actorUserId: admin.userId,
      action: "PAYMENT_APPROVED",
      targetType: "SubscriptionPayment",
      targetId: paymentId,
      businessId: payment.businessId,
      metadata: {
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        method: payment.method,
        reference: payment.reference,
        plan: payment.planId,
        billingPeriod: payment.billingPeriod,
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
      },
    });

    return { paymentId, periodStart: start, periodEnd: end, applied: true };
  });
}

export async function rejectPayment(
  admin: PlatformAdminContext,
  paymentId: string,
  reason: string,
  now: Date = new Date(),
): Promise<void> {
  if (admin.role !== "SUPER_ADMIN" && admin.role !== "FINANCE") {
    throw appError.forbidden("Your platform role cannot reject payments.");
  }
  const trimmed = reason.trim();
  if (trimmed.length < 5 || trimmed.length > 500) {
    throw appError.validationError("Give the customer a clear reason (5–500 characters).");
  }

  await prisma.$transaction(async (tx) => {
    const payment = await tx.subscriptionPayment.findUnique({ where: { id: paymentId } });
    if (!payment) throw appError.notFound("Payment not found.");
    if (payment.status === "REJECTED") return; // idempotent
    if (payment.status === "APPROVED") {
      throw appError.conflict("This payment was already approved and cannot be rejected.");
    }
    const flipped = await tx.subscriptionPayment.updateMany({
      where: { id: paymentId, status: "PENDING" },
      data: { status: "REJECTED", rejectionReason: trimmed, reviewedById: admin.userId, reviewedAt: now },
    });
    if (flipped.count === 0) {
      throw appError.conflict("This payment was just reviewed by someone else. Refresh to see the result.");
    }
    await writePlatformAudit(tx, {
      actorUserId: admin.userId,
      action: "PAYMENT_REJECTED",
      targetType: "SubscriptionPayment",
      targetId: paymentId,
      businessId: payment.businessId,
      metadata: { reason: trimmed, reference: payment.reference },
    });
  });
}

// ─── Evidence access ──────────────────────────────────────────────────────

export type EvidenceAccess =
  | { allowed: true; payment: SubscriptionPayment; viewer: "SUBMITTER_OWNER" | "REVIEWER" }
  | { allowed: false };

/**
 * Evidence may be read only by (a) a finance-capable platform admin, or (b) the
 * business owner who owns the payment. Reviewer reads are audited.
 */
export async function authorizeEvidenceAccess(
  userId: string,
  paymentId: string,
): Promise<EvidenceAccess> {
  const payment = await prisma.subscriptionPayment.findUnique({ where: { id: paymentId } });
  if (!payment) return { allowed: false };

  const grant = await prisma.platformAdmin.findUnique({ where: { userId } });
  if (grant && grant.revokedAt === null && (grant.role === "SUPER_ADMIN" || grant.role === "FINANCE")) {
    await writePlatformAudit(prisma, {
      actorUserId: userId,
      action: "PAYMENT_EVIDENCE_VIEWED",
      targetType: "SubscriptionPayment",
      targetId: paymentId,
      businessId: payment.businessId,
    });
    return { allowed: true, payment, viewer: "REVIEWER" };
  }

  const membership = await prisma.businessMember.findUnique({
    where: { userId_businessId: { userId, businessId: payment.businessId } },
  });
  if (membership && membership.status === "ACTIVE" && membership.role === "OWNER") {
    return { allowed: true, payment, viewer: "SUBMITTER_OWNER" };
  }
  return { allowed: false };
}
