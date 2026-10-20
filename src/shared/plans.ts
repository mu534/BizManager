/**
 * Plan catalog — the single authoritative definition of BizManager plans,
 * their feature entitlements, usage limits and DEFAULT pricing.
 *
 *  - Entitlements and limits live here (code) so they cannot drift from the
 *    behaviour the application actually implements. Server enforcement and the
 *    public pricing page both read this module.
 *  - Prices live in the database (`plans` table) so platform administrators can
 *    change them without a deploy. The values below are only the defaults used
 *    to seed that table (see prisma/seed.ts and the plans migration).
 *
 * Money is an integer in the smallest currency unit (ETB cents).
 */

export const PLAN_CODES = ["BASIC", "PRO", "BUSINESS"] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export const BILLING_PERIODS = ["MONTHLY", "YEARLY"] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];

export const FEATURE_KEYS = {
  /** Offline recording of sales/expenses/inventory + later sync. All plans. */
  OFFLINE_SYNC: "OFFLINE_SYNC",
  /** Period comparisons, profitability, valuation, category/payment analysis. */
  ADVANCED_REPORTS: "ADVANCED_REPORTS",
  /** CSV/printable report exports. */
  REPORT_EXPORTS: "REPORT_EXPORTS",
  /** Employee accounts, configurable permissions, report-access grants. */
  MULTI_USER: "MULTI_USER",
  /** Multiple branches under one business, consolidated reporting. */
  MULTI_BRANCH: "MULTI_BRANCH",
} as const;
export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];

export const LIMIT_KEYS = {
  MAX_PRODUCTS: "MAX_PRODUCTS",
  MAX_USERS: "MAX_USERS",
  MAX_BRANCHES: "MAX_BRANCHES",
  MAX_TRANSACTIONS_MONTH: "MAX_TRANSACTIONS_MONTH",
} as const;
export type LimitKey = (typeof LIMIT_KEYS)[keyof typeof LIMIT_KEYS];

/** -1 means unlimited. */
export const UNLIMITED = -1;

export interface PlanDefinition {
  code: PlanCode;
  displayName: string;
  /** Ascending rank: a higher rank includes everything below it. */
  rank: number;
  features: ReadonlySet<FeatureKey>;
  limits: Readonly<Record<LimitKey, number>>;
  /** DEFAULT price per month in ETB cents. Database value wins at runtime. */
  defaultMonthlyPriceMinor: number;
}

/** Default yearly discount, in basis points (2000 = 20%). Database value wins. */
export const DEFAULT_ANNUAL_DISCOUNT_BPS = 2000;
export const DEFAULT_CURRENCY = "ETB";

const BASIC_FEATURES: FeatureKey[] = [FEATURE_KEYS.OFFLINE_SYNC];
const PRO_FEATURES: FeatureKey[] = [
  ...BASIC_FEATURES,
  FEATURE_KEYS.ADVANCED_REPORTS,
  FEATURE_KEYS.REPORT_EXPORTS,
  FEATURE_KEYS.MULTI_USER,
];
const BUSINESS_FEATURES: FeatureKey[] = [...PRO_FEATURES, FEATURE_KEYS.MULTI_BRANCH];

export const PLANS: Readonly<Record<PlanCode, PlanDefinition>> = {
  BASIC: {
    code: "BASIC",
    displayName: "Basic",
    rank: 1,
    features: new Set(BASIC_FEATURES),
    limits: {
      MAX_PRODUCTS: UNLIMITED,
      MAX_USERS: 1, // owner only
      MAX_BRANCHES: 1, // one shop location
      MAX_TRANSACTIONS_MONTH: UNLIMITED,
    },
    defaultMonthlyPriceMinor: 50_000, // 500 ETB
  },
  PRO: {
    code: "PRO",
    displayName: "Pro",
    rank: 2,
    features: new Set(PRO_FEATURES),
    limits: {
      MAX_PRODUCTS: UNLIMITED,
      MAX_USERS: 10,
      MAX_BRANCHES: 1,
      MAX_TRANSACTIONS_MONTH: UNLIMITED,
    },
    defaultMonthlyPriceMinor: 120_000, // 1,200 ETB
  },
  BUSINESS: {
    code: "BUSINESS",
    displayName: "Business",
    rank: 3,
    features: new Set(BUSINESS_FEATURES),
    limits: {
      MAX_PRODUCTS: UNLIMITED,
      MAX_USERS: UNLIMITED,
      MAX_BRANCHES: UNLIMITED,
      MAX_TRANSACTIONS_MONTH: UNLIMITED,
    },
    defaultMonthlyPriceMinor: 250_000, // 2,500 ETB
  },
};

export function isPlanCode(value: string): value is PlanCode {
  return (PLAN_CODES as readonly string[]).includes(value);
}

export function planHasFeature(code: PlanCode, feature: FeatureKey): boolean {
  return PLANS[code].features.has(feature);
}

export function planLimit(code: PlanCode, key: LimitKey): number {
  return PLANS[code].limits[key];
}

/** Lowest plan that includes a feature — used for upgrade prompts. */
export function minimumPlanFor(feature: FeatureKey): PlanCode {
  const found = PLAN_CODES.find((c) => PLANS[c].features.has(feature));
  // Every feature is defined on at least one plan; BUSINESS is the superset.
  return found ?? "BUSINESS";
}

// ─── Pricing ──────────────────────────────────────────────────────────────

export interface PricingInput {
  monthlyPriceMinor: number;
  annualDiscountBps: number;
}

function assertPricing(p: PricingInput): void {
  if (!Number.isSafeInteger(p.monthlyPriceMinor) || p.monthlyPriceMinor < 0) {
    throw new RangeError("Monthly price must be a non-negative integer (minor units).");
  }
  if (!Number.isInteger(p.annualDiscountBps) || p.annualDiscountBps < 0 || p.annualDiscountBps > 10_000) {
    throw new RangeError("Annual discount must be between 0 and 10000 basis points.");
  }
}

/** Amount payable for a billing period, integer minor units, half-up rounding. */
export function priceForPeriod(p: PricingInput, period: BillingPeriod): number {
  assertPricing(p);
  if (period === "MONTHLY") return p.monthlyPriceMinor;
  const gross = p.monthlyPriceMinor * 12;
  const discount = Math.floor((gross * p.annualDiscountBps + 5_000) / 10_000);
  return gross - discount;
}

/** Effective per-month price when billed yearly. */
export function effectiveMonthlyWhenYearly(p: PricingInput): number {
  return Math.round(priceForPeriod(p, "YEARLY") / 12);
}

/** Amount saved by choosing yearly over twelve monthly payments. */
export function yearlySavings(p: PricingInput): number {
  assertPricing(p);
  return p.monthlyPriceMinor * 12 - priceForPeriod(p, "YEARLY");
}
