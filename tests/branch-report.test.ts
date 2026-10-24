import { describe, it, expect } from "vitest";
import { buildBranchComparison, type BranchFinancials } from "@shared/branch-report";

const branch = (o: Partial<BranchFinancials> & Pick<BranchFinancials, "branchId" | "netSales" | "cogs" | "expenses">): BranchFinancials => ({
  branchName: o.branchId,
  closed: false,
  salesCount: 1,
  grossProfit: o.netSales - o.cogs,
  operatingProfit: o.netSales - o.cogs - o.expenses,
  ...o,
});

describe("buildBranchComparison", () => {
  it("per-branch rows add up to the totals (spec example: 10,000 / 6,000 / 4,000 / 1,000 / 3,000)", () => {
    const r = buildBranchComparison([
      branch({ branchId: "Main", netSales: 6_000, cogs: 3_500, expenses: 600 }),
      branch({ branchId: "Bole", netSales: 4_000, cogs: 2_500, expenses: 400 }),
    ]);
    expect(r.totals).toMatchObject({ netSales: 10_000, cogs: 6_000, grossProfit: 4_000, expenses: 1_000, operatingProfit: 3_000 });
    expect(r.rows.reduce((s, x) => s + x.operatingProfit, 0)).toBe(r.totals.operatingProfit);
  });

  it("ranks by sales, with share and margin in basis points", () => {
    const r = buildBranchComparison([
      branch({ branchId: "Small", netSales: 2_000, cogs: 1_000, expenses: 0 }),
      branch({ branchId: "Big", netSales: 8_000, cogs: 4_000, expenses: 2_000 }),
    ]);
    expect(r.rows.map((x) => x.branchId)).toEqual(["Big", "Small"]);
    expect(r.rows[0]).toMatchObject({ salesShareBps: 8_000, marginBps: 2_500 });
    expect(r.rows[1]).toMatchObject({ salesShareBps: 2_000, marginBps: 5_000 });
  });

  it("does not invent a margin or share when there were no sales", () => {
    const r = buildBranchComparison([branch({ branchId: "Idle", netSales: 0, cogs: 0, expenses: 300 })]);
    expect(r.rows[0]).toMatchObject({ marginBps: null, salesShareBps: null, operatingProfit: -300 });
  });

  it("closed branches stay in the totals (history is never dropped)", () => {
    const r = buildBranchComparison([
      branch({ branchId: "Open", netSales: 1_000, cogs: 500, expenses: 0 }),
      branch({ branchId: "Closed", closed: true, netSales: 3_000, cogs: 1_000, expenses: 0 }),
    ]);
    expect(r.totals.netSales).toBe(4_000);
    expect(r.rows.find((x) => x.branchId === "Closed")?.closed).toBe(true);
  });

  it("empty input gives empty rows and zero totals", () => {
    expect(buildBranchComparison([])).toEqual({
      rows: [],
      totals: { salesCount: 0, netSales: 0, cogs: 0, grossProfit: 0, expenses: 0, operatingProfit: 0 },
    });
  });
});
