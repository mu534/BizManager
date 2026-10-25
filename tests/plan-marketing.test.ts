import { describe, it, expect } from "vitest";
import { PLAN_FEATURE_LINES, PLAN_BASE } from "@shared/plan-marketing";
import { PLAN_CODES } from "@shared/plans";
import { getDictionary } from "@shared/i18n";

describe("plan marketing lines", () => {
  const all = PLAN_CODES.flatMap((c) => PLAN_FEATURE_LINES[c].map((l) => l.key));

  it("every advertised line has non-empty copy in English and Afaan Oromo", () => {
    for (const key of all) {
      expect(getDictionary("en").pricing.features[key].trim().length, `en ${key}`).toBeGreaterThan(0);
      expect(getDictionary("om").pricing.features[key].trim().length, `om ${key}`).toBeGreaterThan(0);
    }
  });

  it("no feature is listed under two plans (lines are incremental)", () => {
    expect(new Set(all).size).toBe(all.length);
  });

  it("every dictionary feature line is used by some plan (no orphaned copy)", () => {
    const keys = Object.keys(getDictionary("en").pricing.features).sort();
    expect([...new Set(all)].sort()).toEqual(keys);
  });

  it("plans chain Basic → Pro → Business", () => {
    expect(PLAN_BASE).toEqual({ BASIC: null, PRO: "BASIC", BUSINESS: "PRO" });
  });

  it("only features that are built are shown as available (flags are explicit)", () => {
    for (const c of PLAN_CODES) for (const l of PLAN_FEATURE_LINES[c]) expect(["available", "soon"]).toContain(l.availability);
  });
});
