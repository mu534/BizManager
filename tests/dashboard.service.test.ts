import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  hasAdvanced: false,
  canSee: true,
  inventoryCalls: [] as { includeValuation?: boolean }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@server/auth/permissions", () => ({ canViewFinancialReports: () => h.canSee }));
vi.mock("@server/services/subscription.service", () => ({
  hasFeature: async () => h.hasAdvanced,
  FEATURE_KEYS: { ADVANCED_REPORTS: "ADVANCED_REPORTS" },
}));
vi.mock("@server/services/business-time", () => ({ getBusinessTime: async () => ({ currency: "ETB", offsetMinutes: 180 }) }));
vi.mock("@server/services/branch-access.service", () => ({
  listAccessibleBranches: async () => [
    { id: "b-main", name: "Main", status: "ACTIVE", isDefault: true },
    { id: "b-bole", name: "Bole", status: "ACTIVE", isDefault: false },
  ],
}));
vi.mock("@server/services/report.service", () => ({
  computePeriodFinancials: async () => ({ sales: 0, refunds: 0, netSales: 0, cogs: 0, grossProfit: 0, expenses: 0, operatingProfit: 0, salesCount: 0, returnsCount: 0, discounts: 0, daily: [] }),
  getInventoryReport: async (_c: unknown, _b: string, opts: { includeValuation?: boolean }) => {
    h.inventoryCalls.push(opts);
    return { items: [], lowStockCount: 0, outOfStockCount: 0, totalValue: 123_000 };
  },
}));
vi.mock("@server/db/prisma", () => ({
  prisma: {
    business: { findUnique: async () => ({ name: "Shop" }) },
    financialAccount: { findMany: async () => [] },
    sale: { findMany: async () => [] },
  },
}));

import { getDashboard } from "@server/services/dashboard.service";
import { UserRole, type TenantContext } from "@shared/types/auth.types";

const ctx: TenantContext = { userId: "u", firebaseUid: "f", businessId: "biz", membershipId: "m", role: UserRole.OWNER, financialReportGrant: false, branchId: null };

beforeEach(() => {
  h.hasAdvanced = false;
  h.canSee = true;
  h.inventoryCalls.length = 0;
});

describe("getDashboard", () => {
  it("regression: a Basic plan owner still gets a dashboard — valuation is not requested", async () => {
    h.hasAdvanced = false;
    const d = await getDashboard(ctx, "today");
    expect(h.inventoryCalls).toEqual([{ includeValuation: false }]);
    expect(d.inventory.value).toBeNull();
    expect(d.canSeeFinancials).toBe(true);
  });

  it("a Pro owner gets inventory value", async () => {
    h.hasAdvanced = true;
    const d = await getDashboard(ctx, "today");
    expect(h.inventoryCalls).toEqual([{ includeValuation: true }]);
    expect(d.inventory.value).toBe(123_000);
  });

  it("someone without financial access never gets value, whatever the plan", async () => {
    h.hasAdvanced = true;
    h.canSee = false;
    const d = await getDashboard(ctx, "today");
    expect(h.inventoryCalls).toEqual([{ includeValuation: false }]);
    expect(d.inventory.value).toBeNull();
    expect(d.profit).toBeNull();
  });

  it("uses the member's chosen branch when they may use it, else the default", async () => {
    expect((await getDashboard(ctx, "today", "b-bole")).branch).toEqual({ id: "b-bole", name: "Bole" });
    expect((await getDashboard(ctx, "today", "b-not-mine")).branch).toEqual({ id: "b-main", name: "Main" });
    expect((await getDashboard(ctx, "today")).branch.id).toBe("b-main");
  });
});
