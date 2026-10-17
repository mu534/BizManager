/**
 * Subscription service — SERVER ONLY.
 *
 * Manages BizManager SaaS subscription state.
 * IMPORTANT: This domain is completely separate from merchant finances.
 * A merchant's Cash/Telebirr balance has nothing to do with their
 * BizManager subscription payment.
 *
 * Payment gateway (UD-003) is NOT YET CONFIGURED.
 * The billing domain is implemented correctly; payment integration
 * is blocked pending the payment provider decision.
 */
import "server-only";
import type { Subscription, Plan, PlanFeature, UsageLimit } from "@prisma/client";
import { prisma } from "@server/db/prisma";
import { appError } from "@shared/errors";
import type { TenantContext } from "@shared/types/auth.types";

const TRIAL_DAYS = 14;

// ─── Feature keys ─────────────────────────────────────────────────────────────

export const FEATURE_KEYS = {
  MULTI_BRANCH: "MULTI_BRANCH",
  ADVANCED_REPORTS: "ADVANCED_REPORTS",
  MULTI_USER: "MULTI_USER",
  OFFLINE_SYNC: "OFFLINE_SYNC",
  TAX_TOOLS: "TAX_TOOLS",
} as const;

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];

// ─── Limit keys ───────────────────────────────────────────────────────────────

export const LIMIT_KEYS = {
  MAX_PRODUCTS: "MAX_PRODUCTS",
  MAX_USERS: "MAX_USERS",
  MAX_TRANSACTIONS_MONTH: "MAX_TRANSACTIONS_MONTH",
} as const;

export type LimitKey = (typeof LIMIT_KEYS)[keyof typeof LIMIT_KEYS];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SubscriptionWithPlan extends Subscription {
  plan: Plan & {
    features: PlanFeature[];
    limits: UsageLimit[];
  };
}

export interface SubscriptionSummary {
  status: string;
  planName: string;
  planDisplayName: string;
  trialDaysRemaining: number | null;
  isExpired: boolean;
  isInTrial: boolean;
  features: Record<string, boolean>;
  limits: Record<string, number>;
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Create a 14-day TRIAL subscription for a newly created business.
 * Called inside the business creation transaction.
 * Requires a STARTER plan to exist — create plans via seed script first.
 */
export async function createTrialSubscription(
  businessId: string,
  tx?: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
): Promise<Subscription> {
  const db = tx ?? prisma;

  // Find the starter plan (or any available plan).
  const starterPlan = await db.plan.findFirst({
    where: { name: "STARTER", isActive: true },
  });

  if (!starterPlan) {
    // If no plan exists yet (before seed), create subscription without plan reference.
    // This shouldn't happen in production after the seed is run.
    throw appError.serverError(
      "No active plans found. Run the seed script first: npx prisma db seed",
    );
  }

  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  // Idempotent: a business has at most one subscription.
  const already = await db.subscription.findUnique({ where: { businessId } });
  if (already) return already;

  return db.subscription.create({
    data: {
      businessId,
      planId: starterPlan.id,
      status: "TRIAL",
      trialEndsAt,
      currentPeriodStart: now,
      currentPeriodEnd: trialEndsAt,
    },
  });
}

/**
 * Load the current subscription for the context business.
 * Returns null if no subscription exists (pre-trial state).
 */
export async function getSubscription(
  ctx: TenantContext,
): Promise<SubscriptionWithPlan | null> {
  return prisma.subscription.findUnique({
    where: { businessId: ctx.businessId },
    include: {
      plan: {
        include: {
          features: true,
          limits: true,
        },
      },
    },
  });
}

/**
 * Get a human-readable subscription summary.
 */
export async function getSubscriptionSummary(
  ctx: TenantContext,
): Promise<SubscriptionSummary | null> {
  const sub = await getSubscription(ctx);
  if (!sub) return null;

  const now = new Date();
  const isExpired =
    sub.status === "EXPIRED" ||
    sub.status === "CANCELLED" ||
    (sub.status === "TRIAL" && sub.trialEndsAt != null && sub.trialEndsAt < now);

  const isInTrial = sub.status === "TRIAL" && !isExpired;

  const trialDaysRemaining =
    isInTrial && sub.trialEndsAt
      ? Math.max(
          0,
          Math.ceil(
            (sub.trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
          ),
        )
      : null;

  const features: Record<string, boolean> = {};
  for (const f of sub.plan.features) {
    features[f.featureKey] = f.enabled;
  }

  const limits: Record<string, number> = {};
  for (const l of sub.plan.limits) {
    limits[l.limitKey] = l.value;
  }

  return {
    status: sub.status,
    planName: sub.plan.name,
    planDisplayName: sub.plan.displayName,
    trialDaysRemaining,
    isExpired,
    isInTrial,
    features,
    limits,
  };
}

/**
 * Check whether the business has access to a specific feature.
 * Throws SUBSCRIPTION_LIMIT if not entitled or subscription is expired.
 *
 * NOTE: Offline sync (OFFLINE_SYNC) is available to all plans — it is
 * not a premium-only feature per the architecture requirements.
 */
export async function checkFeatureEntitlement(
  ctx: TenantContext,
  featureKey: FeatureKey,
): Promise<void> {
  // Offline sync is always available regardless of subscription.
  if (featureKey === FEATURE_KEYS.OFFLINE_SYNC) return;

  const sub = await getSubscription(ctx);
  if (!sub) {
    throw appError.subscriptionLimit(
      "No active subscription found. Please set up your subscription.",
    );
  }

  const now = new Date();
  const isExpired =
    sub.status === "EXPIRED" ||
    sub.status === "CANCELLED" ||
    (sub.status === "TRIAL" && sub.trialEndsAt != null && sub.trialEndsAt < now);

  if (isExpired) {
    throw appError.subscriptionLimit(
      "Your subscription has expired. Please renew to continue.",
    );
  }

  const feature = sub.plan.features.find((f) => f.featureKey === featureKey);
  if (!feature || !feature.enabled) {
    throw appError.subscriptionLimit(
      `Your plan does not include ${featureKey}. Upgrade to access this feature.`,
    );
  }
}

/**
 * Check whether the business is within a usage limit.
 * Throws SUBSCRIPTION_LIMIT if exceeded.
 * Does nothing if the limit is -1 (unlimited).
 */
export async function checkUsageLimit(
  ctx: TenantContext,
  limitKey: LimitKey,
  currentUsage: number,
): Promise<void> {
  const sub = await getSubscription(ctx);
  if (!sub) return; // No subscription — limits not enforced during setup.

  const limit = sub.plan.limits.find((l) => l.limitKey === limitKey);
  if (!limit) return; // Limit not configured — allow.
  if (limit.value === -1) return; // Unlimited.

  if (currentUsage >= limit.value) {
    throw appError.subscriptionLimit(
      `You have reached the ${limitKey} limit for your plan (${limit.value}). Upgrade to continue.`,
    );
  }
}

/**
 * Update subscription status — for future webhook processing.
 * IMPORTANT: Status must be set server-side based on payment verification.
 * Never trust status submitted by the browser.
 */
export async function updateSubscriptionStatus(
  businessId: string,
  status: "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED",
): Promise<void> {
  await prisma.subscription.update({
    where: { businessId },
    data: { status },
  });
}

// ─── Server-side enforcement ──────────────────────────────────────────────────
//
// Until now the entitlement helpers above were defined but never called, and
// createTrialSubscription() was never invoked, so no business had a
// subscription and nothing was enforced. Enforcement now happens inside the
// services (never in the browser), so it also covers offline-sync and API
// callers.

function isSubscriptionExpired(sub: SubscriptionWithPlan, now: Date): boolean {
  return (
    sub.status === "EXPIRED" ||
    sub.status === "CANCELLED" ||
    (sub.status === "TRIAL" && sub.trialEndsAt != null && sub.trialEndsAt < now)
  );
}

/**
 * Load the subscription, provisioning a 14-day trial for businesses created
 * before trials were wired into business creation. Safe under concurrency:
 * the unique businessId constraint makes a racing second create fail, after
 * which the winner's row is read.
 */
export async function ensureSubscription(
  ctx: TenantContext,
): Promise<SubscriptionWithPlan> {
  const existing = await getSubscription(ctx);
  if (existing) return existing;
  try {
    await createTrialSubscription(ctx.businessId);
  } catch (err) {
    // A concurrent request may have created it; fall through and re-read.
    const again = await getSubscription(ctx);
    if (again) return again;
    throw err;
  }
  const created = await getSubscription(ctx);
  if (!created) throw appError.serverError("Could not provision subscription.");
  return created;
}

/**
 * Block creation of new business data when the trial/subscription has lapsed.
 * Reads, reports and returns/refunds stay available so a merchant is never
 * locked out of their own records.
 */
export async function assertSubscriptionActive(
  ctx: TenantContext,
): Promise<SubscriptionWithPlan> {
  const sub = await ensureSubscription(ctx);
  if (isSubscriptionExpired(sub, new Date())) {
    throw appError.subscriptionLimit(
      "Your trial or subscription has ended. Renew your plan to record new sales, products and expenses.",
    );
  }
  return sub;
}

/**
 * Active-subscription check plus a usage cap. `countUsage` is only invoked
 * when the plan has a finite limit, so unlimited plans cost no extra query.
 */
export async function assertWithinLimit(
  ctx: TenantContext,
  limitKey: LimitKey,
  countUsage: () => Promise<number>,
): Promise<void> {
  const sub = await assertSubscriptionActive(ctx);
  const limit = sub.plan.limits.find((l) => l.limitKey === limitKey);
  if (!limit || limit.value === -1) return;
  const used = await countUsage();
  if (used >= limit.value) {
    throw appError.subscriptionLimit(
      `You have reached the ${limitKey.replace(/_/g, " ").toLowerCase()} limit for your ${sub.plan.displayName} plan (${limit.value}). Upgrade to continue.`,
    );
  }
}
