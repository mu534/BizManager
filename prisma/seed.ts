/**
 * Prisma seed script — creates default plans.
 *
 * Run with: npx prisma db seed
 *
 * This script is idempotent — safe to run multiple times.
 * It uses upsert so existing data is preserved.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding plans...");

  // ── STARTER plan ────────────────────────────────────────────────────────────
  const starter = await prisma.plan.upsert({
    where: { name: "STARTER" },
    update: { displayName: "Starter", isActive: true },
    create: { name: "STARTER", displayName: "Starter", isActive: true },
  });

  await prisma.planFeature.upsert({
    where: { planId_featureKey: { planId: starter.id, featureKey: "OFFLINE_SYNC" } },
    update: { enabled: true },
    create: { planId: starter.id, featureKey: "OFFLINE_SYNC", enabled: true },
  });
  await prisma.planFeature.upsert({
    where: { planId_featureKey: { planId: starter.id, featureKey: "MULTI_USER" } },
    update: { enabled: false },
    create: { planId: starter.id, featureKey: "MULTI_USER", enabled: false },
  });
  await prisma.planFeature.upsert({
    where: { planId_featureKey: { planId: starter.id, featureKey: "MULTI_BRANCH" } },
    update: { enabled: false },
    create: { planId: starter.id, featureKey: "MULTI_BRANCH", enabled: false },
  });
  await prisma.planFeature.upsert({
    where: { planId_featureKey: { planId: starter.id, featureKey: "ADVANCED_REPORTS" } },
    update: { enabled: false },
    create: { planId: starter.id, featureKey: "ADVANCED_REPORTS", enabled: false },
  });

  await prisma.usageLimit.upsert({
    where: { planId_limitKey: { planId: starter.id, limitKey: "MAX_PRODUCTS" } },
    update: { value: 200 },
    create: { planId: starter.id, limitKey: "MAX_PRODUCTS", value: 200 },
  });
  await prisma.usageLimit.upsert({
    where: { planId_limitKey: { planId: starter.id, limitKey: "MAX_USERS" } },
    update: { value: 1 },
    create: { planId: starter.id, limitKey: "MAX_USERS", value: 1 },
  });
  await prisma.usageLimit.upsert({
    where: { planId_limitKey: { planId: starter.id, limitKey: "MAX_TRANSACTIONS_MONTH" } },
    update: { value: 500 },
    create: { planId: starter.id, limitKey: "MAX_TRANSACTIONS_MONTH", value: 500 },
  });

  // ── BUSINESS plan ───────────────────────────────────────────────────────────
  const business = await prisma.plan.upsert({
    where: { name: "BUSINESS" },
    update: { displayName: "Business", isActive: true },
    create: { name: "BUSINESS", displayName: "Business", isActive: true },
  });

  for (const key of ["OFFLINE_SYNC", "MULTI_USER", "ADVANCED_REPORTS"]) {
    await prisma.planFeature.upsert({
      where: { planId_featureKey: { planId: business.id, featureKey: key } },
      update: { enabled: true },
      create: { planId: business.id, featureKey: key, enabled: true },
    });
  }
  await prisma.planFeature.upsert({
    where: { planId_featureKey: { planId: business.id, featureKey: "MULTI_BRANCH" } },
    update: { enabled: false },
    create: { planId: business.id, featureKey: "MULTI_BRANCH", enabled: false },
  });

  await prisma.usageLimit.upsert({
    where: { planId_limitKey: { planId: business.id, limitKey: "MAX_PRODUCTS" } },
    update: { value: 2000 },
    create: { planId: business.id, limitKey: "MAX_PRODUCTS", value: 2000 },
  });
  await prisma.usageLimit.upsert({
    where: { planId_limitKey: { planId: business.id, limitKey: "MAX_USERS" } },
    update: { value: 5 },
    create: { planId: business.id, limitKey: "MAX_USERS", value: 5 },
  });
  await prisma.usageLimit.upsert({
    where: { planId_limitKey: { planId: business.id, limitKey: "MAX_TRANSACTIONS_MONTH" } },
    update: { value: -1 },
    create: { planId: business.id, limitKey: "MAX_TRANSACTIONS_MONTH", value: -1 },
  });

  // ── PRO plan ────────────────────────────────────────────────────────────────
  const pro = await prisma.plan.upsert({
    where: { name: "PRO" },
    update: { displayName: "Pro", isActive: true },
    create: { name: "PRO", displayName: "Pro", isActive: true },
  });

  for (const key of ["OFFLINE_SYNC", "MULTI_USER", "ADVANCED_REPORTS", "MULTI_BRANCH", "TAX_TOOLS"]) {
    await prisma.planFeature.upsert({
      where: { planId_featureKey: { planId: pro.id, featureKey: key } },
      update: { enabled: true },
      create: { planId: pro.id, featureKey: key, enabled: true },
    });
  }

  for (const [key, value] of [["MAX_PRODUCTS", -1], ["MAX_USERS", -1], ["MAX_TRANSACTIONS_MONTH", -1]] as [string, number][]) {
    await prisma.usageLimit.upsert({
      where: { planId_limitKey: { planId: pro.id, limitKey: key } },
      update: { value },
      create: { planId: pro.id, limitKey: key, value },
    });
  }

  console.log("✓ Plans seeded: STARTER, BUSINESS, PRO");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
