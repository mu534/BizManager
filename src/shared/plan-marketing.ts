/**
 * What each plan advertises on the public site, and whether it is built yet.
 *
 * The public site must never promise a capability the product lacks. Every
 * line carries an availability flag: "soon" renders a "Coming soon" badge. When
 * a feature ships, flip its flag here — nothing else changes.
 *
 * Entitlements (what the server enforces) live in plans.ts; this file is only
 * the marketing copy keys and their honest status.
 */
import type { Dictionary } from "./i18n/en";
import type { PlanCode } from "./plans";

export type FeatureLineKey = keyof Dictionary["pricing"]["features"];
export type Availability = "available" | "soon";
export interface PlanFeatureLine {
  key: FeatureLineKey;
  availability: Availability;
}

const a = (key: FeatureLineKey): PlanFeatureLine => ({ key, availability: "available" });
/** Mark a feature not yet built — the site then shows "Coming soon" beside it. Currently every advertised feature is built. */
export const soon = (key: FeatureLineKey): PlanFeatureLine => ({ key, availability: "soon" });

/** Lines are INCREMENTAL: Pro shows only what it adds to Basic, and so on. */
export const PLAN_FEATURE_LINES: Record<PlanCode, readonly PlanFeatureLine[]> = {
  BASIC: [
    a("catalog"),
    a("weightedCost"),
    a("pos"),
    a("salesReturns"),
    a("expenses"),
    a("accounts"),
    a("basicPnl"),
    a("lowStock"),
    a("offline"),
    a("oneShop"),
  ],
  PRO: [
    a("advancedReports"),
    a("productProfit"),
    a("stockReports"),
    a("expenseCategories"),
    a("paymentBreakdown"),
    a("exports"),
    a("employees"),
    a("reportGrants"),
  ],
  BUSINESS: [a("branches"), a("branchData"), a("consolidated"), a("centralStaff")],
};

/** The plan whose features this plan builds on (for "Everything in X, plus:"). */
export const PLAN_BASE: Record<PlanCode, PlanCode | null> = {
  BASIC: null,
  PRO: "BASIC",
  BUSINESS: "PRO",
};
