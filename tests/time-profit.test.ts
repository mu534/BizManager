import { describe, expect, it } from "vitest";
import {
  addDays, businessDayKey, businessUtcOffsetMinutes, endOfBusinessDay,
  enumerateDays, isDayKey, resolvePeriod, startOfBusinessDay,
} from "@shared/time";
import { bucketDaily, computeProfit } from "@shared/profit";

const ET = businessUtcOffsetMinutes("ET");

describe("business day (Ethiopia, UTC+3)", () => {
  it("uses +180 minutes for ET and UTC for unknown countries", () => {
    expect(ET).toBe(180);
    expect(businessUtcOffsetMinutes("XX")).toBe(0);
    expect(businessUtcOffsetMinutes(undefined)).toBe(0);
  });

  it("regression: a sale at 01:00 local belongs to that local day, not the previous UTC day", () => {
    const instant = new Date("2026-10-14T22:00:00Z"); // 01:00 on Oct 15 in Addis
    expect(businessDayKey(instant, ET)).toBe("2026-10-15");
    expect(instant.toISOString().slice(0, 10)).toBe("2026-10-14"); // what the old code used
  });

  it("day boundaries are 21:00Z → 20:59:59.999Z", () => {
    expect(startOfBusinessDay("2026-10-15", ET).toISOString()).toBe("2026-10-14T21:00:00.000Z");
    expect(endOfBusinessDay("2026-10-15", ET).toISOString()).toBe("2026-10-15T20:59:59.999Z");
  });

  it("validates day keys strictly", () => {
    expect(isDayKey("2026-02-30")).toBe(false);
    expect(isDayKey("2026-2-3")).toBe(false);
    expect(isDayKey("2026-10-15")).toBe(true);
  });

  it("adds days and enumerates inclusively across month ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(enumerateDays("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });
});

describe("resolvePeriod", () => {
  const now = new Date("2026-10-15T09:00:00Z");
  it("today / 7days / month", () => {
    expect(resolvePeriod({ range: "today" }, ET, now)).toMatchObject({ fromKey: "2026-10-15", toKey: "2026-10-15" });
    expect(resolvePeriod({ range: "7days" }, ET, now)).toMatchObject({ fromKey: "2026-10-09", toKey: "2026-10-15" });
    expect(resolvePeriod({ range: "month" }, ET, now)).toMatchObject({ fromKey: "2026-10-01", toKey: "2026-10-15" });
  });
  it("custom ranges are swapped if reversed and fall back safely if invalid or huge", () => {
    expect(resolvePeriod({ range: "custom", from: "2026-10-10", to: "2026-10-05" }, ET, now)).toMatchObject({ fromKey: "2026-10-05", toKey: "2026-10-10" });
    expect(resolvePeriod({ range: "custom", from: "nope", to: "2026-10-05" }, ET, now).fromKey).toBe("2026-10-15");
    expect(resolvePeriod({ range: "custom", from: "2020-01-01", to: "2026-10-05" }, ET, now).fromKey).toBe("2026-10-15");
  });
  it("exposes date-only bounds for @db.Date columns", () => {
    const p = resolvePeriod({ range: "7days" }, ET, now);
    expect(p.fromDate.toISOString()).toBe("2026-10-09T00:00:00.000Z");
    expect(p.toDate.toISOString()).toBe("2026-10-15T00:00:00.000Z");
  });
});

describe("computeProfit", () => {
  it("regression: a fully returned, restocked sale nets to zero (no double subtraction)", () => {
    const r = computeProfit({ sales: 1000, refunds: 1000, soldCost: 600, restockedReturnCost: 600, expenses: 0 });
    expect(r).toMatchObject({ netSales: 0, cogs: 0, grossProfit: 0, operatingProfit: 0 });
  });
  it("damaged returns refund the customer but keep the cost", () => {
    const r = computeProfit({ sales: 1000, refunds: 1000, soldCost: 600, restockedReturnCost: 0, expenses: 0 });
    expect(r.grossProfit).toBe(-600);
  });
  it("does not clamp negative results", () => {
    const r = computeProfit({ sales: 0, refunds: 500, soldCost: 0, restockedReturnCost: 0, expenses: 200 });
    expect(r.netSales).toBe(-500);
    expect(r.operatingProfit).toBe(-700);
  });
});

describe("bucketDaily", () => {
  it("zero-fills days and nets refunds on the day they were issued", () => {
    const days = ["2026-10-13", "2026-10-14", "2026-10-15"];
    const pts = bucketDaily(days, [{ day: "2026-10-13", amount: 500 }, { day: "2026-10-13", amount: 250 }], [{ day: "2026-10-15", amount: 100 }]);
    expect(pts.map((p) => p.date)).toEqual(days);
    expect(pts[0]).toMatchObject({ sales: 750, count: 2, net: 750 });
    expect(pts[1]).toMatchObject({ sales: 0, net: 0 });
    expect(pts[2]).toMatchObject({ refunds: 100, net: -100 });
  });
});
