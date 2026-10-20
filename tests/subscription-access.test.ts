import { describe, it, expect } from "vitest";
import {
  decideAccess,
  computeNextPeriod,
  addMonthsUtc,
  graceEnd,
  GRACE_PERIOD_DAYS,
  type SubscriptionSnapshot,
} from "@shared/subscription-access";

const d = (iso: string) => new Date(iso);
const periodEnd = d("2026-11-01T00:00:00.000Z");
const active: SubscriptionSnapshot = { status: "ACTIVE", currentPeriodEnd: periodEnd, trialEndsAt: null };

describe("decideAccess", () => {
  it("grace period is exactly 3 days", () => {
    expect(GRACE_PERIOD_DAYS).toBe(3);
    expect(graceEnd(periodEnd).toISOString()).toBe("2026-11-04T00:00:00.000Z");
  });

  it("ACTIVE before the period ends", () => {
    const r = decideAccess(active, false, d("2026-10-20T00:00:00.000Z"));
    expect(r.state).toBe("ACTIVE");
    expect(r.canWrite).toBe(true);
    expect(r.daysRemaining).toBe(12);
  });

  it("GRACE right after expiry still allows writes and reports time left", () => {
    const r = decideAccess(active, false, d("2026-11-01T00:00:00.000Z"));
    expect(r.state).toBe("GRACE");
    expect(r.canWrite).toBe(true);
    expect(r.daysRemaining).toBe(3);
    const later = decideAccess(active, false, d("2026-11-03T12:00:00.000Z"));
    expect(later.state).toBe("GRACE");
    expect(later.daysRemaining).toBe(1);
  });

  it("READ_ONLY from the instant the grace window closes", () => {
    const r = decideAccess(active, false, d("2026-11-04T00:00:00.000Z"));
    expect(r.state).toBe("READ_ONLY");
    expect(r.canWrite).toBe(false);
    expect(r.canRead).toBe(true);
    expect(r.canExport).toBe(true);
  });

  it("a stored ACTIVE status cannot keep an expired period writable", () => {
    // The decision is derived from dates + server clock, never from status alone.
    const r = decideAccess(active, false, d("2027-03-01T00:00:00.000Z"));
    expect(r.state).toBe("READ_ONLY");
    expect(r.canWrite).toBe(false);
  });

  it("no subscription => read-only (payment must be approved first)", () => {
    const r = decideAccess(null, false, d("2026-10-20T00:00:00.000Z"));
    expect(r.state).toBe("NONE");
    expect(r.canWrite).toBe(false);
    expect(r.canRead).toBe(true);
  });

  it("cancelled and suspended block writes immediately but keep read/export", () => {
    const cancelled = decideAccess({ ...active, status: "CANCELLED" }, false, d("2026-10-20T00:00:00.000Z"));
    expect(cancelled.state).toBe("CANCELLED");
    expect(cancelled.canWrite).toBe(false);
    const suspended = decideAccess(active, true, d("2026-10-20T00:00:00.000Z"));
    expect(suspended.state).toBe("SUSPENDED");
    expect(suspended.canWrite).toBe(false);
    expect(suspended.canExport).toBe(true);
  });

  it("legacy trial honours trialEndsAt then follows the same grace rules", () => {
    const trial: SubscriptionSnapshot = {
      status: "TRIAL",
      currentPeriodEnd: d("2026-12-31T00:00:00.000Z"),
      trialEndsAt: d("2026-10-25T00:00:00.000Z"),
    };
    expect(decideAccess(trial, false, d("2026-10-24T00:00:00.000Z")).state).toBe("ACTIVE");
    expect(decideAccess(trial, false, d("2026-10-26T00:00:00.000Z")).state).toBe("GRACE");
    expect(decideAccess(trial, false, d("2026-10-29T00:00:00.000Z")).state).toBe("READ_ONLY");
  });
});

describe("computeNextPeriod", () => {
  it("first payment starts now", () => {
    const now = d("2026-10-18T10:00:00.000Z");
    const p = computeNextPeriod(null, 1, now);
    expect(p.start).toEqual(now);
    expect(p.end.toISOString()).toBe("2026-11-18T10:00:00.000Z");
  });

  it("early renewal continues from the old end (no paid days lost)", () => {
    const p = computeNextPeriod(periodEnd, 1, d("2026-10-20T00:00:00.000Z"));
    expect(p.start).toEqual(periodEnd);
    expect(p.end.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });

  it("renewal inside grace continues from the old end", () => {
    const p = computeNextPeriod(periodEnd, 1, d("2026-11-02T00:00:00.000Z"));
    expect(p.start).toEqual(periodEnd);
  });

  it("renewal after grace starts at the approval time (no backdated free period)", () => {
    const now = d("2026-12-10T08:00:00.000Z");
    const p = computeNextPeriod(periodEnd, 12, now);
    expect(p.start).toEqual(now);
    expect(p.end.toISOString()).toBe("2027-12-10T08:00:00.000Z");
  });
});

describe("addMonthsUtc", () => {
  it("clamps to the last day of shorter months", () => {
    expect(addMonthsUtc(d("2026-01-31T00:00:00.000Z"), 1).toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(addMonthsUtc(d("2028-01-31T00:00:00.000Z"), 1).toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });
  it("rolls over years", () => {
    expect(addMonthsUtc(d("2026-11-15T00:00:00.000Z"), 3).toISOString()).toBe("2027-02-15T00:00:00.000Z");
  });
});
