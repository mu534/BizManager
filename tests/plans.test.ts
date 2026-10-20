import { describe, it, expect } from "vitest";
import {
  PLANS,
  PLAN_CODES,
  FEATURE_KEYS,
  LIMIT_KEYS,
  UNLIMITED,
  planHasFeature,
  planLimit,
  minimumPlanFor,
  priceForPeriod,
  effectiveMonthlyWhenYearly,
  yearlySavings,
  DEFAULT_ANNUAL_DISCOUNT_BPS,
  type PlanCode,
} from "@shared/plans";

describe("feature entitlements", () => {
  it("Basic keeps offline recording but not Pro/Business features", () => {
    expect(planHasFeature("BASIC", FEATURE_KEYS.OFFLINE_SYNC)).toBe(true);
    expect(planHasFeature("BASIC", FEATURE_KEYS.ADVANCED_REPORTS)).toBe(false);
    expect(planHasFeature("BASIC", FEATURE_KEYS.MULTI_USER)).toBe(false);
    expect(planHasFeature("BASIC", FEATURE_KEYS.MULTI_BRANCH)).toBe(false);
  });

  it("Pro adds advanced reports, exports and employees but not branches", () => {
    expect(planHasFeature("PRO", FEATURE_KEYS.ADVANCED_REPORTS)).toBe(true);
    expect(planHasFeature("PRO", FEATURE_KEYS.REPORT_EXPORTS)).toBe(true);
    expect(planHasFeature("PRO", FEATURE_KEYS.MULTI_USER)).toBe(true);
    expect(planHasFeature("PRO", FEATURE_KEYS.MULTI_BRANCH)).toBe(false);
  });

  it("Business includes everything", () => {
    for (const key of Object.values(FEATURE_KEYS)) {
      expect(planHasFeature("BUSINESS", key)).toBe(true);
    }
  });

  it("each higher plan is a strict superset of the one below", () => {
    for (let i = 1; i < PLAN_CODES.length; i++) {
      const lower = PLANS[PLAN_CODES[i - 1] as PlanCode];
      const higher = PLANS[PLAN_CODES[i] as PlanCode];
      for (const f of lower.features) expect(higher.features.has(f)).toBe(true);
      expect(higher.features.size).toBeGreaterThan(lower.features.size);
      expect(higher.rank).toBeGreaterThan(lower.rank);
    }
  });

  it("offline sync is on every plan (never an upsell)", () => {
    for (const code of PLAN_CODES) expect(planHasFeature(code, FEATURE_KEYS.OFFLINE_SYNC)).toBe(true);
  });

  it("limits: one location on Basic/Pro, unlimited branches on Business", () => {
    expect(planLimit("BASIC", LIMIT_KEYS.MAX_BRANCHES)).toBe(1);
    expect(planLimit("PRO", LIMIT_KEYS.MAX_BRANCHES)).toBe(1);
    expect(planLimit("BUSINESS", LIMIT_KEYS.MAX_BRANCHES)).toBe(UNLIMITED);
    expect(planLimit("BASIC", LIMIT_KEYS.MAX_USERS)).toBe(1);
  });

  it("minimumPlanFor points to the cheapest plan with the feature", () => {
    expect(minimumPlanFor(FEATURE_KEYS.OFFLINE_SYNC)).toBe("BASIC");
    expect(minimumPlanFor(FEATURE_KEYS.ADVANCED_REPORTS)).toBe("PRO");
    expect(minimumPlanFor(FEATURE_KEYS.MULTI_BRANCH)).toBe("BUSINESS");
  });

  it("default prices increase with rank", () => {
    const prices = PLAN_CODES.map((c) => PLANS[c].defaultMonthlyPriceMinor);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });
});

describe("pricing", () => {
  const basic = { monthlyPriceMinor: 50_000, annualDiscountBps: DEFAULT_ANNUAL_DISCOUNT_BPS };

  it("monthly equals the monthly price", () => {
    expect(priceForPeriod(basic, "MONTHLY")).toBe(50_000);
  });

  it("yearly applies the configured discount to 12 months", () => {
    // 12 * 500 = 6000 ETB, minus 20% = 4800 ETB
    expect(priceForPeriod(basic, "YEARLY")).toBe(480_000);
    expect(yearlySavings(basic)).toBe(120_000);
    expect(effectiveMonthlyWhenYearly(basic)).toBe(40_000);
  });

  it("zero discount means 12x monthly", () => {
    expect(priceForPeriod({ monthlyPriceMinor: 70_000, annualDiscountBps: 0 }, "YEARLY")).toBe(840_000);
  });

  it("rounds the discount half-up in integers", () => {
    // gross 12*333 = 3996; 10% = 399.6 -> 400; payable 3596
    expect(priceForPeriod({ monthlyPriceMinor: 333, annualDiscountBps: 1000 }, "YEARLY")).toBe(3596);
  });

  it("rejects invalid configuration", () => {
    expect(() => priceForPeriod({ monthlyPriceMinor: -1, annualDiscountBps: 0 }, "MONTHLY")).toThrow(RangeError);
    expect(() => priceForPeriod({ monthlyPriceMinor: 1, annualDiscountBps: 10_001 }, "YEARLY")).toThrow(RangeError);
    expect(() => priceForPeriod({ monthlyPriceMinor: 1.5, annualDiscountBps: 0 }, "MONTHLY")).toThrow(RangeError);
  });
});
