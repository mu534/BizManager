
import "server-only";
import type { Subscription, Plan } from "@prisma/client";
import { prisma } from "@server/db/prisma";
import { appError } from "@shared/errors";
import type { TenantContext } from "@shared/types/auth.types";
import {
  FEATURE_KEYS,
  LIMIT_KEYS,
  PLANS,
  UNLIMITED,
  isPlanCode,
  minimumPlanFor,
  planHasFeature,
  planLimit,
  type FeatureKey,
  type LimitKey,
  type PlanCode,
} from "@shared/plans";
import { decideAccess, type AccessDecision } from "@shared/subscription-access";

export { FEATURE_KEYS, LIMIT_KEYS };
export type { FeatureKey, LimitKey };

export interface SubscriptionAccess {
  decision: AccessDecision;
  subscription: (Subscription & { plan: Plan }) | null;
  /** Resolved plan code; null when the business has never had a plan. */
  planCode: PlanCode | null;
}

/** Fail closed: an unrecognised stored plan name gets the lowest plan. */
function resolvePlanCode(name: string): PlanCode {
  return isPlanCode(name) ? name : "BASIC";
}

/**
 * Load the authoritative access decision for a business.
 * `now` is injectable for tests; production callers use the server clock.
 */
export async function getSubscriptionAccess(
  businessId: string,
  now: Date = new Date(),
): Promise<SubscriptionAccess> {
  const [business, subscription] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId }, select: { status: true } }),
    prisma.subscription.findUnique({ where: { businessId }, include: { plan: true } }),
  ]);
  if (!business) throw appError.notFound("Business not found.");

  const decision = decideAccess(
    subscription
      ? {
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd,
          trialEndsAt: subscription.trialEndsAt,
        }
      : null,
    business.status !== "ACTIVE",
    now,
  );

  return {
    decision,
    subscription,
    planCode: subscription ? resolvePlanCode(subscription.plan.name) : null,
  };
}

const RESTRICTION_FALLBACK =
  "Your subscription has ended. You can view and export your data, but new transactions are paused until you renew.";

const RESTRICTION_MESSAGES: Record<string, string> = {
  NONE: "Choose a plan and submit your payment to start recording sales, products and expenses. You can still view your data.",
  READ_ONLY:
    "Your subscription has ended. You can view and export your data, but new transactions are paused until you renew.",
  CANCELLED: "Your subscription was cancelled. You can view and export your data. Renew to record new transactions.",
  SUSPENDED: "This business is suspended. You can view and export your data. Contact support to resolve this.",
};

/**
 * Block creation of new business data unless the subscription permits writes.
 * Reads, exports, returns/refunds review stay available so a merchant is never
 * locked out of their own records. Throws SUBSCRIPTION_LIMIT with a message
 * that is clearly a subscription restriction (not a network or sync failure).
 */
export async function assertSubscriptionActive(ctx: TenantContext): Promise<SubscriptionAccess> {
  const access = await getSubscriptionAccess(ctx.businessId);
  if (!access.decision.canWrite) {
    throw appError.subscriptionLimit(
      RESTRICTION_MESSAGES[access.decision.state] ?? RESTRICTION_FALLBACK,
    );
  }
  return access;
}

/** Require a plan feature. Also requires an active (or grace) subscription. */
export async function requireFeature(
  ctx: TenantContext,
  feature: FeatureKey,
): Promise<SubscriptionAccess> {
  const access = await getSubscriptionAccess(ctx.businessId);
  // Feature access for reading reports stays available in read-only states if
  // the plan once included it; but a business with no plan has no features.
  if (!access.planCode) {
    throw appError.subscriptionLimit(RESTRICTION_MESSAGES.NONE ?? RESTRICTION_FALLBACK);
  }
  if (!planHasFeature(access.planCode, feature)) {
    const needed = PLANS[minimumPlanFor(feature)].displayName;
    throw appError.subscriptionLimit(
      `Your ${PLANS[access.planCode].displayName} plan does not include this feature. Upgrade to ${needed} or higher.`,
    );
  }
  return access;
}

/** Non-throwing feature probe for UI decisions (never a substitute for requireFeature). */
export async function hasFeature(businessId: string, feature: FeatureKey): Promise<boolean> {
  const access = await getSubscriptionAccess(businessId);
  return access.planCode !== null && planHasFeature(access.planCode, feature);
}

/**
 * Active-subscription check plus a plan usage cap. `countUsage` is only invoked
 * when the plan has a finite limit, so unlimited plans cost no extra query.
 */
export async function assertWithinLimit(
  ctx: TenantContext,
  limitKey: LimitKey,
  countUsage: () => Promise<number>,
): Promise<void> {
  const access = await assertSubscriptionActive(ctx);
  // assertSubscriptionActive guarantees a subscription (and thus a plan) here.
  const code = access.planCode ?? "BASIC";
  const limit = planLimit(code, limitKey);
  if (limit === UNLIMITED) return;
  const used = await countUsage();
  if (used >= limit) {
    throw appError.subscriptionLimit(
      `You have reached the ${limitKey.replace(/_/g, " ").toLowerCase()} limit for your ${PLANS[code].displayName} plan (${limit}). Upgrade to continue.`,
    );
  }
}

// ─── Summary for the subscription page / banner ───────────────────────────

export interface SubscriptionSummary {
  state: AccessDecision["state"];
  canWrite: boolean;
  planCode: PlanCode | null;
  planDisplayName: string | null;
  billingPeriod: "MONTHLY" | "YEARLY" | null;
  periodEndsAt: Date | null;
  graceEndsAt: Date | null;
  daysRemaining: number | null;
  features: Record<FeatureKey, boolean>;
}

export async function getSubscriptionSummary(ctx: TenantContext): Promise<SubscriptionSummary> {
  const access = await getSubscriptionAccess(ctx.businessId);
  const features = {} as Record<FeatureKey, boolean>;
  for (const key of Object.values(FEATURE_KEYS)) {
    features[key] = access.planCode ? planHasFeature(access.planCode, key) : false;
  }
  return {
    state: access.decision.state,
    canWrite: access.decision.canWrite,
    planCode: access.planCode,
    planDisplayName: access.planCode ? PLANS[access.planCode].displayName : null,
    billingPeriod: access.subscription?.billingPeriod ?? null,
    periodEndsAt: access.decision.periodEndsAt,
    graceEndsAt: access.decision.graceEndsAt,
    daysRemaining: access.decision.daysRemaining,
    features,
  };
}
