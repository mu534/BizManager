/**
 * Refund and discount allocation — pure integer math (smallest currency unit).
 *
 * Defects this module fixes (see REDESIGN_ASSESSMENT.md):
 *  1. Refunds ignored the sale-level discount, so a customer could be refunded
 *     more than they paid (and a fully-returned sale never reached RETURNED).
 *  2. Per-unit rounding (`round(line/qty) * returnQty`) could refund more or
 *     less than the line total when everything was returned.
 *
 * Approach: allocate the sale-level discount across lines (largest remainder,
 * so allocations sum exactly to the discount), giving each line a "net paid"
 * amount. A partial return refunds the *difference of cumulative rounded
 * shares*, so refunds across any sequence of returns always sum to exactly
 * the net paid when all units are returned.
 */

/** Integer division rounding half up, without floating-point error. */
function roundDiv(numerator: number, denominator: number): number {
  if (denominator <= 0) throw new Error("Denominator must be positive.");
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

/**
 * Split `saleDiscount` across lines proportionally to their line totals.
 * Uses largest-remainder so the allocations sum EXACTLY to saleDiscount.
 * Ties break by lower index, so the result is deterministic.
 */
export function allocateSaleDiscount(
  lineTotals: readonly number[],
  saleDiscount: number,
): number[] {
  const subtotal = lineTotals.reduce((a, b) => a + b, 0);
  if (saleDiscount < 0 || saleDiscount > subtotal) {
    throw new Error("Sale discount must be between 0 and the subtotal.");
  }
  if (saleDiscount === 0 || subtotal === 0) return lineTotals.map(() => 0);

  const raw = lineTotals.map((t) => (t * saleDiscount) / subtotal);
  const floors = raw.map((r) => Math.floor(r));
  let remainder = saleDiscount - floors.reduce((a, b) => a + b, 0);

  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  const result = [...floors];
  for (const { i } of order) {
    if (remainder <= 0) break;
    // Never allocate more discount to a line than the line is worth.
    if (result[i]! < lineTotals[i]!) {
      result[i]! += 1;
      remainder -= 1;
    }
  }
  return result;
}

/** What the customer actually paid for a line after its share of the sale discount. */
export function lineNetPaid(lineTotal: number, allocatedSaleDiscount: number): number {
  return lineTotal - allocatedSaleDiscount;
}

/**
 * Refund owed for returning `returnQty` more units of a line, given that
 * `alreadyReturnedQty` units were returned before.
 */
export function refundForReturn(
  netPaid: number,
  soldQty: number,
  alreadyReturnedQty: number,
  returnQty: number,
): number {
  if (soldQty <= 0) throw new Error("Sold quantity must be positive.");
  if (alreadyReturnedQty < 0 || returnQty <= 0) {
    throw new Error("Invalid return quantities.");
  }
  if (alreadyReturnedQty + returnQty > soldQty) {
    throw new Error("Cannot return more than was sold.");
  }
  const before = roundDiv(netPaid * alreadyReturnedQty, soldQty);
  const after = roundDiv(netPaid * (alreadyReturnedQty + returnQty), soldQty);
  return after - before;
}
