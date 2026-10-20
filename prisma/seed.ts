/**
 * Prisma seed — creates the three BizManager plans if they are missing.
 *
 * Run with: npx prisma db seed       (idempotent)
 *
 * Feature entitlements and limits are NOT stored in the database; they live in
 * src/shared/plans.ts. This seed only creates plan rows with DEFAULT prices.
 * It never overwrites a price or discount that an administrator has changed:
 * existing rows only get their display name / sort order refreshed.
 */
import { PrismaClient } from "@prisma/client";
import { DEFAULT_ANNUAL_DISCOUNT_BPS, DEFAULT_CURRENCY, PLANS, PLAN_CODES } from "../src/shared/plans";

const prisma = new PrismaClient();

async function main() {
  for (const code of PLAN_CODES) {
    const def = PLANS[code];
    await prisma.plan.upsert({
      where: { name: code },
      update: { displayName: def.displayName, sortOrder: def.rank },
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
    console.log(`Plan ready: ${code}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
