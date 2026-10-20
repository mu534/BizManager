import { describe, it, expect } from "vitest";
import { hasFinancialReportAccess, planMemberUpdate, normalizeEmail, type MemberState } from "@shared/team-rules";

const manager: MemberState = { role: "MANAGER", status: "ACTIVE", financialReportAccess: false };
const grantedManager: MemberState = { ...manager, financialReportAccess: true };
const staff: MemberState = { role: "STAFF", status: "ACTIVE", financialReportAccess: false };

describe("hasFinancialReportAccess", () => {
  it("owner always has access", () => {
    expect(hasFinancialReportAccess("OWNER", false)).toBe(true);
  });
  it("manager only with an explicit grant", () => {
    expect(hasFinancialReportAccess("MANAGER", false)).toBe(false);
    expect(hasFinancialReportAccess("MANAGER", true)).toBe(true);
  });
  it("staff never, even if a stale grant flag exists", () => {
    expect(hasFinancialReportAccess("STAFF", false)).toBe(false);
    expect(hasFinancialReportAccess("STAFF", true)).toBe(false);
  });
});

describe("planMemberUpdate", () => {
  it("grants report access to a manager and emits an audit event", () => {
    const r = planMemberUpdate(manager, { financialReportAccess: true }, false);
    expect(r).toEqual({ ok: true, next: grantedManager, events: ["REPORT_ACCESS_GRANTED"] });
  });

  it("revokes access", () => {
    const r = planMemberUpdate(grantedManager, { financialReportAccess: false }, false);
    expect(r.ok && r.events).toEqual(["REPORT_ACCESS_REVOKED"]);
  });

  it("refuses to grant report access to staff", () => {
    expect(planMemberUpdate(staff, { financialReportAccess: true }, false)).toEqual({ ok: false, error: "GRANT_REQUIRES_MANAGER" });
  });

  it("refuses to grant when demoting and granting in one change", () => {
    expect(planMemberUpdate(manager, { role: "STAFF", financialReportAccess: true }, false)).toEqual({ ok: false, error: "GRANT_REQUIRES_MANAGER" });
  });

  it("demoting a granted manager to staff clears the grant", () => {
    const r = planMemberUpdate(grantedManager, { role: "STAFF" }, false);
    expect(r.ok && r.next).toEqual({ role: "STAFF", status: "ACTIVE", financialReportAccess: false });
    expect(r.ok && r.events).toEqual(["MEMBER_ROLE_CHANGED", "REPORT_ACCESS_REVOKED"]);
  });

  it("re-promoting does not silently restore a previous grant", () => {
    const demoted = planMemberUpdate(grantedManager, { role: "STAFF" }, false);
    if (!demoted.ok) throw new Error("setup failed");
    const back = planMemberUpdate(demoted.next, { role: "MANAGER" }, false);
    expect(back.ok && back.next.financialReportAccess).toBe(false);
  });

  it("deactivating clears the grant, reactivating does not restore it", () => {
    const off = planMemberUpdate(grantedManager, { status: "INACTIVE" }, false);
    expect(off.ok && off.next.financialReportAccess).toBe(false);
    expect(off.ok && off.events).toEqual(["MEMBER_DEACTIVATED", "REPORT_ACCESS_REVOKED"]);
    if (!off.ok) throw new Error("setup failed");
    const on = planMemberUpdate(off.next, { status: "ACTIVE" }, false);
    expect(on.ok && on.next.financialReportAccess).toBe(false);
    expect(on.ok && on.events).toEqual(["MEMBER_REACTIVATED"]);
  });

  it("the owner cannot be modified, and nobody can modify themselves", () => {
    const owner: MemberState = { role: "OWNER", status: "ACTIVE", financialReportAccess: false };
    expect(planMemberUpdate(owner, { status: "INACTIVE" }, false)).toEqual({ ok: false, error: "OWNER_IMMUTABLE" });
    expect(planMemberUpdate(manager, { role: "STAFF" }, true)).toEqual({ ok: false, error: "SELF_CHANGE" });
  });

  it("revoked members cannot be edited; no-op changes are reported", () => {
    expect(planMemberUpdate({ ...staff, status: "REVOKED" }, { role: "MANAGER" }, false)).toEqual({ ok: false, error: "REVOKED_MEMBER" });
    expect(planMemberUpdate(manager, { role: "MANAGER", financialReportAccess: false }, false)).toEqual({ ok: false, error: "NO_CHANGE" });
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Abebe@Example.COM ")).toBe("abebe@example.com");
  });
});
