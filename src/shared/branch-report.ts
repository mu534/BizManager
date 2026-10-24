/**
 * Cross-branch comparison — pure, integer-only.
 *
 * Each branch's figures come from the same period calculation as every other
 * report, so the totals row equals the consolidated profit report for the same
 * branches and period. Margin is null (not 0) when a branch had no revenue.
 */
export interface BranchFinancials {
  branchId: string;
  branchName: string;
  /** Closed branches keep their history in the totals. */
  closed: boolean;
  salesCount: number;
  netSales: number;
  cogs: number;
  grossProfit: number;
  expenses: number;
  operatingProfit: number;
}

export interface BranchComparisonRow extends BranchFinancials {
  /** Operating profit ÷ net sales in basis points; null when net sales ≤ 0. */
  marginBps: number | null;
  /** Share of total net sales in basis points; null when total ≤ 0. */
  salesShareBps: number | null;
}

export interface BranchComparison {
  rows: BranchComparisonRow[];
  totals: Omit<BranchFinancials, "branchId" | "branchName" | "closed">;
}

function ratioBps(numerator: number, denominator: number): number {
  const sign = numerator < 0 ? -1 : 1;
  return sign * Math.floor((Math.abs(numerator) * 10_000 * 2 + denominator) / (denominator * 2));
}

export function buildBranchComparison(input: readonly BranchFinancials[]): BranchComparison {
  const totals = { salesCount: 0, netSales: 0, cogs: 0, grossProfit: 0, expenses: 0, operatingProfit: 0 };
  for (const b of input) {
    totals.salesCount += b.salesCount;
    totals.netSales += b.netSales;
    totals.cogs += b.cogs;
    totals.grossProfit += b.grossProfit;
    totals.expenses += b.expenses;
    totals.operatingProfit += b.operatingProfit;
  }
  const rows = input
    .map((b) => ({
      ...b,
      marginBps: b.netSales > 0 ? ratioBps(b.operatingProfit, b.netSales) : null,
      salesShareBps: totals.netSales > 0 ? ratioBps(b.netSales, totals.netSales) : null,
    }))
    .sort((a, b) => b.netSales - a.netSales || a.branchName.localeCompare(b.branchName));
  return { rows, totals };
}
