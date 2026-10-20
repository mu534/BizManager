/**
 * Product performance (profitability, best sellers) — pure, integer-only.
 *
 * Reconciles with the profit report by construction, using the same rules:
 *   revenue  = Σ sold line totals − allocated sale-level discount − refunds
 *   COGS     = Σ (cost snapshot × qty sold) − Σ (cost snapshot × qty restocked)
 *   profit   = revenue − COGS            (gross profit; operating expenses are
 *                                         not attributable to products)
 * Cost always comes from the immutable per-sale cost snapshot, never from the
 * product's current editable cost.
 *
 * A sale-level discount applies to the whole basket, so it is spread over that
 * sale's lines in proportion to their value (largest-remainder, exact integers)
 * — otherwise product revenues would not add up to the real sales total.
 */

export interface SoldLine {
  saleId: string;
  productId: string;
  productName: string;
  productSku: string | null;
  quantity: number;
  unitCost: number;
  lineTotal: number;
}

export interface ReturnedLine {
  productId: string;
  productName: string;
  productSku: string | null;
  quantity: number;
  refundAmount: number;
  unitCost: number;
  /** Only restocked units give their cost back; damaged/discarded units stay a cost. */
  restocked: boolean;
}

export interface ProductPerformanceRow {
  productId: string;
  productName: string;
  productSku: string | null;
  /** Units sold minus units returned. */
  unitsSold: number;
  revenue: number;
  cogs: number;
  profit: number;
  /** Profit ÷ revenue in basis points (1250 = 12.5%); null when revenue ≤ 0. */
  marginBps: number | null;
  /** Share of total profit in basis points; null when total profit ≤ 0. */
  profitShareBps: number | null;
}

export interface ProductPerformance {
  rows: ProductPerformanceRow[];
  totals: { unitsSold: number; revenue: number; cogs: number; profit: number };
}

/** Spread `discount` over `values` proportionally; the result sums to exactly `discount`. */
export function allocateDiscount(values: readonly number[], discount: number): number[] {
  if (!Number.isSafeInteger(discount) || discount < 0) throw new RangeError("Discount must be a non-negative integer.");
  const total = values.reduce((s, v) => s + v, 0);
  if (discount === 0 || values.length === 0) return values.map(() => 0);
  if (total <= 0) throw new RangeError("Cannot allocate a discount over a zero-value basket.");
  if (discount > total) throw new RangeError("Discount cannot exceed the basket total.");

  const base = values.map((v) => Math.floor((v * discount) / total));
  let remaining = discount - base.reduce((s, v) => s + v, 0);
  // Largest fractional remainder first; ties broken by position for determinism.
  const order = values
    .map((v, i) => ({ i, rem: (v * discount) % total }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of order) {
    if (remaining === 0) break;
    base[i] = (base[i] ?? 0) + 1;
    remaining -= 1;
  }
  return base;
}

function ratioBps(numerator: number, denominator: number): number {
  // Half-up, sign-preserving integer ratio.
  const sign = numerator < 0 ? -1 : 1;
  return sign * Math.floor((Math.abs(numerator) * 10_000 * 2 + denominator) / (denominator * 2));
}

export type SortKey = "revenue" | "profit" | "units";

export function computeProductPerformance(input: {
  lines: readonly SoldLine[];
  /** Sale-level discount per saleId (0 when none). */
  saleDiscounts: ReadonlyMap<string, number>;
  returns: readonly ReturnedLine[];
  sortBy?: SortKey;
}): ProductPerformance {
  type Acc = { name: string; sku: string | null; units: number; revenue: number; cogs: number };
  const acc = new Map<string, Acc>();
  const touch = (id: string, name: string, sku: string | null): Acc => {
    let a = acc.get(id);
    if (!a) {
      a = { name, sku, units: 0, revenue: 0, cogs: 0 };
      acc.set(id, a);
    }
    return a;
  };

  // Group lines by sale to allocate each sale's basket discount.
  const bySale = new Map<string, SoldLine[]>();
  for (const l of input.lines) {
    const list = bySale.get(l.saleId);
    if (list) list.push(l);
    else bySale.set(l.saleId, [l]);
  }
  for (const [saleId, lines] of bySale) {
    const discounts = allocateDiscount(
      lines.map((l) => l.lineTotal),
      input.saleDiscounts.get(saleId) ?? 0,
    );
    lines.forEach((l, i) => {
      const a = touch(l.productId, l.productName, l.productSku);
      a.units += l.quantity;
      a.revenue += l.lineTotal - (discounts[i] ?? 0);
      a.cogs += l.unitCost * l.quantity;
    });
  }

  for (const r of input.returns) {
    const a = touch(r.productId, r.productName, r.productSku);
    a.units -= r.quantity;
    a.revenue -= r.refundAmount;
    if (r.restocked) a.cogs -= r.unitCost * r.quantity;
  }

  const totals = { unitsSold: 0, revenue: 0, cogs: 0, profit: 0 };
  for (const a of acc.values()) {
    totals.unitsSold += a.units;
    totals.revenue += a.revenue;
    totals.cogs += a.cogs;
    totals.profit += a.revenue - a.cogs;
  }

  const rows: ProductPerformanceRow[] = [...acc.entries()].map(([productId, a]) => {
    const profit = a.revenue - a.cogs;
    return {
      productId,
      productName: a.name,
      productSku: a.sku,
      unitsSold: a.units,
      revenue: a.revenue,
      cogs: a.cogs,
      profit,
      marginBps: a.revenue > 0 ? ratioBps(profit, a.revenue) : null,
      profitShareBps: totals.profit > 0 ? ratioBps(profit, totals.profit) : null,
    };
  });

  const key: SortKey = input.sortBy ?? "profit";
  const metric = (r: ProductPerformanceRow) => (key === "units" ? r.unitsSold : key === "revenue" ? r.revenue : r.profit);
  rows.sort((a, b) => metric(b) - metric(a) || a.productName.localeCompare(b.productName));
  return { rows, totals };
}
