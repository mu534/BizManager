import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  featureAllowed: true,
  canSee: true,
  accessible: [
    { id: "b-main", name: "Main", status: "ACTIVE", isDefault: true },
    { id: "b-bole", name: "Bole", status: "ACTIVE", isDefault: false },
    { id: "b-old", name: "Old", status: "INACTIVE", isDefault: false },
  ],
}));

vi.mock("server-only", () => ({}));
vi.mock("@server/db/prisma", () => ({ prisma: {} }));
vi.mock("@server/auth/permissions", () => ({
  requireFinancialReports: () => {
    if (!h.canSee) throw Object.assign(new Error("no access"), { code: "FORBIDDEN" });
  },
}));
vi.mock("@server/services/subscription.service", () => ({
  FEATURE_KEYS: { ADVANCED_REPORTS: "ADVANCED_REPORTS", MULTI_BRANCH: "MULTI_BRANCH" },
  requireFeature: async () => {
    if (!h.featureAllowed) throw Object.assign(new Error("upgrade"), { code: "SUBSCRIPTION_LIMIT" });
  },
}));
vi.mock("@server/services/business-time", () => ({ getBusinessTime: async () => ({ currency: "ETB", offsetMinutes: 180 }) }));
vi.mock("@server/services/branch-access.service", () => ({
  listAccessibleBranches: async () => h.accessible,
  requireBranchAccess: vi.fn(),
}));

import { getBranchComparisonReport } from "@server/services/report.service";
import { resolveReportBranch } from "@server/branch/report-branch";
import { UserRole, type TenantContext } from "@shared/types/auth.types";

const ctx: TenantContext = { userId: "u", firebaseUid: "f", businessId: "biz", membershipId: "m", role: UserRole.OWNER, financialReportGrant: false, branchId: null };

beforeEach(() => {
  h.featureAllowed = true;
  h.canSee = true;
});

describe("resolveReportBranch", () => {
  const actor = { businessId: "biz", membershipId: "m", role: UserRole.OWNER };

  it("returns the member's branches and honours a valid selection", async () => {
    const r = await resolveReportBranch(actor, "b-bole");
    expect(r.selectedId).toBe("b-bole");
    expect(r.branches.map((b) => b.id)).toEqual(["b-main", "b-bole", "b-old"]);
    expect(r.branches.find((b) => b.id === "b-old")?.closed).toBe(true);
  });

  it("ignores a forged, foreign or empty branch id instead of echoing it", async () => {
    for (const bad of ["b-foreign", "'; DROP TABLE branches;--", "", undefined]) {
      expect((await resolveReportBranch(actor, bad)).selectedId).toBeUndefined();
    }
  });
});

describe("getBranchComparisonReport — gating", () => {
  it("needs the Business plan feature", async () => {
    h.featureAllowed = false;
    await expect(getBranchComparisonReport(ctx, { range: "month" })).rejects.toMatchObject({ code: "SUBSCRIPTION_LIMIT" });
  });

  it("needs financial-report access (an ungranted manager is refused)", async () => {
    h.canSee = false;
    await expect(getBranchComparisonReport(ctx, { range: "month" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
