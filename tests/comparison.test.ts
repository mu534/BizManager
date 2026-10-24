import { describe, it, expect } from "vitest";
import { percentChangeBps, buildProfitComparison } from "@shared/comparison";
import { previousPeriod, periodFromKeys } from "@shared/time";

const EAT = 180; // UTC+3

describe("previousPeriod", () => {
  it("is the equal-length period immediately before", () => {
    const p = previousPeriod({ fromKey: "2026-10-01", toKey: "2026-10-18" }, EAT);
    expect(p.fromKey).toBe("2026-09-13");
    expect(p.toKey).toBe("2026-09-30");
  });

  it("a single day compares with the day before", () => {
    const p = previousPeriod({ fromKey: "2026-10-18", toKey: "2026-10-18" }, EAT);
    expect([p.fromKey, p.toKey]).toEqual(["2026-10-17", "2026-10-17"]);
  });

  it("crosses month and year boundaries", () => {
    const p = previousPeriod({ fromKey: "2027-01-01", toKey: "2027-01-07" }, EAT);
    expect([p.fromKey, p.toKey]).toEqual(["2026-12-25", "2026-12-31"]);
  });

  it("uses business-day instants (UTC+3), not UTC midnight", () => {
    const p = periodFromKeys("2026-10-17", "2026-10-17", EAT);
    expect(p.from.toISOString()).toBe("2026-10-16T21:00:00.000Z");
    expect(p.to.toISOString()).toBe("2026-10-17T20:59:59.999Z");
  });

  it("never overlaps the current period", () => {
    const cur = { fromKey: "2026-10-10", toKey: "2026-10-18" };
    const prev = previousPeriod(cur, EAT);
    expect(prev.toKey < cur.fromKey).toBe(true);
  });
});

describe("percentChangeBps", () => {
  it("computes growth and decline", () => {
    expect(percentChangeBps(12_000, 10_000)).toBe(2_000); // +20%
    expect(percentChangeBps(7_500, 10_000)).toBe(-2_500); // −25%
    expect(percentChangeBps(10_000, 10_000)).toBe(0);
  });

  it("is null, not infinity or 0, when the previous value was zero", () => {
    expect(percentChangeBps(500, 0)).toBeNull();
    expect(percentChangeBps(0, 0)).toBeNull();
  });

  it("treats a shrinking loss as an improvement", () => {
    expect(percentChangeBps(-50, -100)).toBe(5_000); // +50%
    expect(percentChangeBps(-150, -100)).toBe(-5_000); // −50%
  });

  it("rounds half away from zero in integers", () => {
    expect(percentChangeBps(3, 2)).toBe(5_000);
    expect(percentChangeBps(1, 3)).toBe(-6_667);
  });
});

describe("buildProfitComparison", () => {
  const base = { sales: 0, refunds: 0 };
  const cur = { ...base, netSales: 10_000, cogs: 6_000, grossProfit: 4_000, expenses: 1_000, operatingProfit: 3_000 };
  const prev = { ...base, netSales: 8_000, cogs: 5_000, grossProfit: 3_000, expenses: 0, operatingProfit: 3_000 };

  it("returns one row per metric with absolute and percent change", () => {
    const rows = buildProfitComparison(cur, prev);
    expect(rows.map((r) => r.key)).toEqual(["netSales", "cogs", "grossProfit", "expenses", "operatingProfit"]);
    expect(rows[0]).toEqual({ key: "netSales", current: 10_000, previous: 8_000, change: 2_000, changeBps: 2_500 });
    expect(rows[2]).toMatchObject({ change: 1_000, changeBps: 3_333 });
    expect(rows[4]).toMatchObject({ change: 0, changeBps: 0 });
  });

  it("does not invent a percentage when the previous period had no expenses", () => {
    const expenses = buildProfitComparison(cur, prev).find((r) => r.key === "expenses");
    expect(expenses).toMatchObject({ previous: 0, change: 1_000, changeBps: null });
  });
});
