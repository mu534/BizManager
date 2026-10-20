/**
 * Public pricing — SERVER ONLY. Read-only and unauthenticated by design: plan
 * names and prices are public information. Uses the same plan rows and the same
 * priceForPeriod() as the payment flow, so the website can never advertise a
 * price different from the amount actually charged.
 */
import "server-only";
import { prisma } from "@server/db/prisma";
import { isPlanCode, priceForPeriod, type PlanCode } from "@shared/plans";

export interface PublicPlan {
  code: PlanCode;
  displayName: string;
  currency: string;
  monthlyMinor: number;
  yearlyMinor: number;
  /** Savings of yearly vs 12 monthly payments, as a whole-number percent. */
  yearlySavingsPercent: number;
}

export async function getPublicPlans(): Promise<PublicPlan[]> {
  const rows = await prisma.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
  const plans: PublicPlan[] = [];
  for (const r of rows) {
    if (!isPlanCode(r.name)) continue;
    const pricing = { monthlyPriceMinor: r.monthlyPriceMinor, annualDiscountBps: r.annualDiscountBps };
    plans.push({
      code: r.name,
      displayName: r.displayName,
      currency: r.currency,
      monthlyMinor: r.monthlyPriceMinor,
      yearlyMinor: priceForPeriod(pricing, "YEARLY"),
      yearlySavingsPercent: Math.round(r.annualDiscountBps / 100),
    });
  }
  return plans;
}
