import { describe, it, expect } from "vitest";
import { allocateDiscount, computeProductPerformance, type SoldLine, type ReturnedLine } from "@shared/product-performance";

const line = (o: Partial<SoldLine> & Pick<SoldLine, "saleId" | "productId" | "quantity" | "unitCost" | "lineTotal">): SoldLine => ({
  productName: o.productId,
  productSku: null,
  ...o,
});

describe("allocateDiscount", () => {
  it("always sums exactly to the discount", () => {
    const parts = allocateDiscount([333, 333, 334], 100);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
  });
  it("is proportional and deterministic", () => {
    expect(allocateDiscount([7_500, 2_500], 1_000)).toEqual([750, 250]);
    expect(allocateDiscount([1, 1, 1], 2)).toEqual([1, 1, 0]);
  });
  it("handles zero discount and rejects impossible input", () => {
    expect(allocateDiscount([100, 200], 0)).toEqual([0, 0]);
    expect(() => allocateDiscount([100], 101)).toThrow(RangeError);
    expect(() => allocateDiscount([0, 0], 5)).toThrow(RangeError);
    expect(() => allocateDiscount([100], -1)).toThrow(RangeError);
  });
});

describe("computeProductPerformance", () => {
  it("reconciles to the spec example: revenue 10,000 / COGS 6,000 / gross profit 4,000", () => {
    const r = computeProductPerformance({
      lines: [
        line({ saleId: "s1", productId: "A", quantity: 10, unitCost: 400, lineTotal: 6_000 }),
        line({ saleId: "s2", productId: "B", quantity: 4, unitCost: 500, lineTotal: 4_000 }),
      ],
      saleDiscounts: new Map(),
      returns: [],
    });
    expect(r.totals).toEqual({ unitsSold: 14, revenue: 10_000, cogs: 6_000, profit: 4_000 });
    expect(r.rows.find((x) => x.productId === "A")).toMatchObject({ revenue: 6_000, cogs: 4_000, profit: 2_000, marginBps: 3_333 });
    expect(r.rows.map((x) => x.profitShareBps)).toEqual([5_000, 5_000]);
  });

  it("allocates a sale-level discount so product revenue sums to the real sale total", () => {
    // Basket of 10,000 with a 1,000 basket discount => sale total 9,000.
    const r = computeProductPerformance({
      lines: [
        line({ saleId: "s1", productId: "A", quantity: 1, unitCost: 3_000, lineTotal: 7_500 }),
        line({ saleId: "s1", productId: "B", quantity: 1, unitCost: 1_000, lineTotal: 2_500 }),
      ],
      saleDiscounts: new Map([["s1", 1_000]]),
      returns: [],
    });
    expect(r.totals.revenue).toBe(9_000);
    expect(r.rows.find((x) => x.productId === "A")?.revenue).toBe(6_750);
    expect(r.rows.find((x) => x.productId === "B")?.revenue).toBe(2_250);
  });

  it("uses the historical cost snapshot per line, not any current product cost", () => {
    const r = computeProductPerformance({
      lines: [
        line({ saleId: "s1", productId: "A", quantity: 10, unitCost: 100, lineTotal: 2_000 }),
        line({ saleId: "s2", productId: "A", quantity: 10, unitCost: 120, lineTotal: 2_400 }),
      ],
      saleDiscounts: new Map(),
      returns: [],
    });
    expect(r.rows[0]).toMatchObject({ cogs: 2_200, revenue: 4_400, profit: 2_200 });
  });

  it("returns reduce units and revenue; restocked units give cost back, damaged ones do not", () => {
    const sold = [line({ saleId: "s1", productId: "A", quantity: 10, unitCost: 100, lineTotal: 2_000 })];
    const ret = (restocked: boolean): ReturnedLine => ({
      productId: "A", productName: "A", productSku: null, quantity: 2, refundAmount: 400, unitCost: 100, restocked,
    });
    const restocked = computeProductPerformance({ lines: sold, saleDiscounts: new Map(), returns: [ret(true)] });
    expect(restocked.rows[0]).toMatchObject({ unitsSold: 8, revenue: 1_600, cogs: 800, profit: 800 });
    const damaged = computeProductPerformance({ lines: sold, saleDiscounts: new Map(), returns: [ret(false)] });
    expect(damaged.rows[0]).toMatchObject({ unitsSold: 8, revenue: 1_600, cogs: 1_000, profit: 600 });
  });

  it("sorts by the chosen metric and does not invent margins for zero revenue", () => {
    const lines = [
      line({ saleId: "s1", productId: "cheap", quantity: 100, unitCost: 5, lineTotal: 1_000 }),
      line({ saleId: "s2", productId: "pricey", quantity: 1, unitCost: 500, lineTotal: 2_000 }),
    ];
    const byUnits = computeProductPerformance({ lines, saleDiscounts: new Map(), returns: [], sortBy: "units" });
    expect(byUnits.rows[0]?.productId).toBe("cheap");
    const byProfit = computeProductPerformance({ lines, saleDiscounts: new Map(), returns: [], sortBy: "profit" });
    expect(byProfit.rows[0]?.productId).toBe("pricey");

    const free = computeProductPerformance({
      lines: [line({ saleId: "s", productId: "gift", quantity: 1, unitCost: 50, lineTotal: 0 })],
      saleDiscounts: new Map(),
      returns: [],
    });
    expect(free.rows[0]).toMatchObject({ revenue: 0, profit: -50, marginBps: null, profitShareBps: null });
  });

  it("returns empty, not fabricated, results when nothing was sold", () => {
    expect(computeProductPerformance({ lines: [], saleDiscounts: new Map(), returns: [] })).toEqual({
      rows: [],
      totals: { unitsSold: 0, revenue: 0, cogs: 0, profit: 0 },
    });
  });
});
