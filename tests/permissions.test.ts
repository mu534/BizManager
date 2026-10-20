import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@server/services/business.service", () => ({ assertMinimumRole: vi.fn() }));

import { canViewFinancialReports, requireFinancialReports } from "@server/auth/permissions";
import { UserRole, type TenantContext } from "@shared/types/auth.types";

const ctx = (role: UserRole, grant: boolean): TenantContext => ({
  userId: "u",
  firebaseUid: "f",
  businessId: "b",
  membershipId: "m",
  role,
  financialReportGrant: grant,
  branchId: null,
});

describe("financial report permission (server chokepoint)", () => {
  it("owner: always", () => {
    expect(canViewFinancialReports(ctx(UserRole.OWNER, false))).toBe(true);
  });

  it("manager: denied by default, allowed only after an explicit grant", () => {
    expect(canViewFinancialReports(ctx(UserRole.MANAGER, false))).toBe(false);
    expect(() => requireFinancialReports(ctx(UserRole.MANAGER, false))).toThrow();
    expect(canViewFinancialReports(ctx(UserRole.MANAGER, true))).toBe(true);
    expect(() => requireFinancialReports(ctx(UserRole.MANAGER, true))).not.toThrow();
  });

  it("staff: never, even with a stale grant flag", () => {
    expect(canViewFinancialReports(ctx(UserRole.STAFF, true))).toBe(false);
    expect(() => requireFinancialReports(ctx(UserRole.STAFF, true))).toThrow();
  });
});
