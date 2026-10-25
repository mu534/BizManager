/**
 * Standalone plan seeder — idempotent, safe to run multiple times.
 *
 * Seeds the three BizManager plans with their feature entitlements and
 * usage limits.  Run with:
 *   npx tsx prisma/seed-plans.ts
 *
 * Note: feature entitlements and usage limits stored here in `plan_features`
 * and `usage_limits` are legacy rows kept for any legacy reads.  The
 * authoritative entitlement source is src/shared/plans.ts.  Prices are
 * managed in the `plans` table and default values are NOT overwritten on
 * subsequent runs so an administrator's changes are preserved.
 */
import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_ANNUAL_DISCOUNT_BPS,
  DEFAULT_CURRENCY,
  PLANS,
  PLAN_CODES,
} from "../src/shared/plans";

const prisma = new PrismaClient();

const PLAN_FEATURES: Record<
  string,
  Array<{ featureKey: string; enabled: boolean }>
> = {
  BASIC: [
    { featureKey: "MULTI_BRANCH", enabled: false },
    { featureKey: "ADVANCED_REPORTS", enabled: false },
    { featureKey: "OFFLINE_SYNC", enabled: true },
  ],
  PRO: [
    { featureKey: "MULTI_BRANCH", enabled: false },
    { featureKey: "ADVANCED_REPORTS", enabled: true },
    { featureKey: "OFFLINE_SYNC", enabled: true },
    { featureKey: "REPORT_EXPORTS", enabled: true },
    { featureKey: "MULTI_USER", enabled: true },
  ],
  BUSINESS: [
    { featureKey: "MULTI_BRANCH", enabled: true },
    { featureKey: "ADVANCED_REPORTS", enabled: true },
    { featureKey: "OFFLINE_SYNC", enabled: true },
    { featureKey: "REPORT_EXPORTS", enabled: true },
    { featureKey: "MULTI_USER", enabled: true },
  ],
};

const PLAN_LIMITS: Record<string, Array<{ limitKey: string; value: number }>> = {
  BASIC: [
    { limitKey: "MAX_PRODUCTS", value: -1 },
    { limitKey: "MAX_USERS", value: 1 },
    { limitKey: "MAX_BRANCHES", value: 1 },
    { limitKey: "MAX_TRANSACTIONS_MONTH", value: -1 },
  ],
  PRO: [
    { limitKey: "MAX_PRODUCTS", value: -1 },
    { limitKey: "MAX_USERS", value: 10 },
    { limitKey: "MAX_BRANCHES", value: 1 },
    { limitKey: "MAX_TRANSACTIONS_MONTH", value: -1 },
  ],
  BUSINESS: [
    { limitKey: "MAX_PRODUCTS", value: -1 },
    { limitKey: "MAX_USERS", value: -1 },
    { limitKey: "MAX_BRANCHES", value: -1 },
    { limitKey: "MAX_TRANSACTIONS_MONTH", value: -1 },
  ],
};

async function main() {
  for (const code of PLAN_CODES) {
    const def = PLANS[code];

    // Upsert the plan row — never overwrite prices set by an administrator.
    const plan = await prisma.plan.upsert({
      where: { name: code },
      update: {
        displayName: def.displayName,
        sortOrder: def.rank,
        isActive: true,
      },
      create: {
        name: code,
        displayName: def.displayName,
        isActive: true,
        monthlyPriceMinor: def.defaultMonthlyPriceMinor,
        annualDiscountBps: DEFAULT_ANNUAL_DISCOUNT_BPS,
        currency: DEFAULT_CURRENCY,
        sortOrder: def.rank,
      },
    });
    console.log(`Plan upserted: ${code} (id=${plan.id})`);

    // Upsert features — idempotent via @@unique([planId, featureKey]).
    const features = PLAN_FEATURES[code] ?? [];
    for (const feat of features) {
      const existing = await prisma.planFeature.findUnique({
        where: { planId_featureKey: { planId: plan.id, featureKey: feat.featureKey } },
      });
      if (existing) {
        await prisma.planFeature.update({
          where: { planId_featureKey: { planId: plan.id, featureKey: feat.featureKey } },
          data: { enabled: feat.enabled },
        });
      } else {
        await prisma.planFeature.create({
          data: { planId: plan.id, featureKey: feat.featureKey, enabled: feat.enabled },
        });
      }
    }

    // Upsert limits — idempotent via @@unique([planId, limitKey]).
    const limits = PLAN_LIMITS[code] ?? [];
    for (const lim of limits) {
      const existing = await prisma.usageLimit.findUnique({
        where: { planId_limitKey: { planId: plan.id, limitKey: lim.limitKey } },
      });
      if (existing) {
        await prisma.usageLimit.update({
          where: { planId_limitKey: { planId: plan.id, limitKey: lim.limitKey } },
          data: { value: lim.value },
        });
      } else {
        await prisma.usageLimit.create({
          data: { planId: plan.id, limitKey: lim.limitKey, value: lim.value },
        });
      }
    }

    console.log(`  Features + limits seeded for: ${code}`);
  }
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
