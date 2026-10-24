/**
 * Period-over-period comparison — pure, integer-only.
 *
 * Percent change is expressed in basis points (1250 = +12.5%) and is `null`
 * when it cannot be stated honestly (the earlier value was zero). The
 * denominator is |previous| so that a loss shrinking from −100 to −50 reads as
 * an improvement (+50%), not as a decrease.
 */
import type { ProfitResult } from "./profit";

export function percentChangeBps(current: number, previous: number): number | null {
  if (previous === 0) return null;
  const diff = current - previous;
  const sign = diff < 0 ? -1 : 1;
  const denom = Math.abs(previous);
  return sign * Math.floor((Math.abs(diff) * 10_000 * 2 + denom) / (denom * 2));
}

export type ComparisonKey = "netSales" | "cogs" | "grossProfit" | "expenses" | "operatingProfit";

export interface ComparisonRow {
  key: ComparisonKey;
  current: number;
  previous: number;
  /** current − previous */
  change: number;
  changeBps: number | null;
}

const KEYS: readonly ComparisonKey[] = ["netSales", "cogs", "grossProfit", "expenses", "operatingProfit"];

export function buildProfitComparison(current: ProfitResult, previous: ProfitResult): ComparisonRow[] {
  return KEYS.map((key) => ({
    key,
    current: current[key],
    previous: previous[key],
    change: current[key] - previous[key],
    changeBps: percentChangeBps(current[key], previous[key]),
  }));
}
