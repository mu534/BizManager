/**
 * Reporting-period rules for sales, returns, cost and profit — pure.
 *
 * One definition used by the dashboard AND every report so the numbers agree:
 *
 *   Sales in period      = non-voided sales CREATED in the period
 *                          (statuses COMPLETED, PARTIALLY_RETURNED, RETURNED)
 *   Refunds in period    = completed returns CREATED in the period
 *   Net sales            = Sales − Refunds
 *   COGS                 = Σ(unitCost × qty) of the sold items
 *                          − Σ(unitCost × qty) of RESTOCKED returned items
 *                          (damaged returns stay in COGS: the stock is lost)
 *   Gross profit         = Net sales − COGS
 *   Operating profit     = Gross profit − Expenses (by expense date)
 *
 * Returns are recognised in the period they are processed (not retroactively
 * restated against the original sale's period). Transfers between accounts
 * and inventory purchases are never revenue or expense.
 *
 * Values are intentionally NOT clamped at zero: a period with more refunds
 * than sales legitimately shows negative net sales. Clamping hid errors.
 */

export interface ProfitInputs {
  sales: number;
  refunds: number;
  soldCost: number;
  restockedReturnCost: number;
  expenses: number;
}

export interface ProfitResult {
  sales: number;
  refunds: number;
  netSales: number;
  cogs: number;
  grossProfit: number;
  expenses: number;
  operatingProfit: number;
}

export function computeProfit(i: ProfitInputs): ProfitResult {
  const netSales = i.sales - i.refunds;
  const cogs = i.soldCost - i.restockedReturnCost;
  const grossProfit = netSales - cogs;
  return {
    sales: i.sales,
    refunds: i.refunds,
    netSales,
    cogs,
    grossProfit,
    expenses: i.expenses,
    operatingProfit: grossProfit - i.expenses,
  };
}

/** Sale statuses that count toward revenue. VOIDED sales never do. */
export const REVENUE_SALE_STATUSES = [
  "COMPLETED",
  "PARTIALLY_RETURNED",
  "RETURNED",
] as const;

export interface DailyPoint {
  date: string;
  sales: number;
  refunds: number;
  net: number;
  count: number;
}

/**
 * Bucket sales and refunds into business-day points, with zero-filled days
 * so charts show gaps honestly.
 */
export function bucketDaily(
  days: readonly string[],
  sales: readonly { day: string; amount: number }[],
  refunds: readonly { day: string; amount: number }[],
): DailyPoint[] {
  const map = new Map<string, DailyPoint>(
    days.map((d) => [d, { date: d, sales: 0, refunds: 0, net: 0, count: 0 }]),
  );
  for (const s of sales) {
    const p = map.get(s.day);
    if (p) {
      p.sales += s.amount;
      p.count += 1;
    }
  }
  for (const r of refunds) {
    const p = map.get(r.day);
    if (p) p.refunds += r.amount;
  }
  for (const p of map.values()) p.net = p.sales - p.refunds;
  // Map preserves insertion order, which is the (ascending) order of `days`.
  return Array.from(map.values());
}
