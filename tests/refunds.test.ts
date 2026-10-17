import { describe, expect, it } from "vitest";
import { allocateSaleDiscount, lineNetPaid, refundForReturn } from "@shared/refunds";

describe("allocateSaleDiscount", () => {
  it("allocations always sum exactly to the discount", () => {
    const lines = [333, 333, 334, 1];
    for (const discount of [0, 1, 7, 100, 333, 1001]) {
      const alloc = allocateSaleDiscount(lines, discount);
      expect(alloc.reduce((a, b) => a + b, 0)).toBe(discount);
      alloc.forEach((a, i) => expect(a).toBeLessThanOrEqual(lines[i]!));
    }
  });

  it("rejects a discount above the subtotal", () => {
    expect(() => allocateSaleDiscount([100, 100], 201)).toThrow();
    expect(() => allocateSaleDiscount([100], -1)).toThrow();
  });

  it("handles an empty/zero subtotal", () => {
    expect(allocateSaleDiscount([0, 0], 0)).toEqual([0, 0]);
  });
});

describe("refundForReturn — regression: refunds must never exceed what was paid", () => {
  it("old behaviour over-refunded a discounted sale; new total equals finalTotal", () => {
    // Two lines of ETB 10.00 each, ETB 5.00 sale-level discount: customer paid 15.00.
    const lineTotals = [1000, 1000];
    const alloc = allocateSaleDiscount(lineTotals, 500);
    const net = lineTotals.map((t, i) => lineNetPaid(t, alloc[i]!));
    expect(net.reduce((a, b) => a + b, 0)).toBe(1500);

    const refund = net.reduce((sum, n) => sum + refundForReturn(n, 1, 0, 1), 0);
    expect(refund).toBe(1500); // the old code refunded 2000
  });

  it("rounding drift: returning 3 of 3 in any split refunds exactly the line", () => {
    // 200 / 3 = 66.67 → old per-unit rounding refunded 67 × 3 = 201.
    const splits = [[3], [1, 2], [2, 1], [1, 1, 1]];
    for (const split of splits) {
      let returned = 0;
      let total = 0;
      for (const q of split) {
        total += refundForReturn(200, 3, returned, q);
        returned += q;
      }
      expect(total).toBe(200);
    }
  });

  it("refuses to return more than was sold", () => {
    expect(() => refundForReturn(1000, 2, 1, 2)).toThrow();
    expect(() => refundForReturn(1000, 2, 0, 0)).toThrow();
  });
});
