import { describe, expect, it } from "vitest";
import {
  computeSale,
  parseMoneyStrict,
  SaleMathError,
  totalQuantityByProduct,
  type ProductPricing,
} from "@shared/sale-math";

const products = new Map<string, ProductPricing>([
  ["p1", { id: "p1", name: "Sugar", sku: "SG", sellingPrice: 5000, costPrice: 4000 }],
  ["p2", { id: "p2", name: "Oil", sku: null, sellingPrice: 12000, costPrice: 10000 }],
]);

const base = { products, currency: "ETB", saleDiscount: "0" } as const;

describe("computeSale", () => {
  it("STAFF cannot override the catalogue price", () => {
    const sale = computeSale({
      ...base,
      canOverridePrice: false,
      items: [{ productId: "p1", unitPrice: "0.01", quantity: 2 }],
    });
    expect(sale.lines[0]!.unitPrice).toBe(5000);
    expect(sale.finalTotal).toBe(10000);
  });

  it("MANAGER may override price; cost is snapshotted from the product", () => {
    const sale = computeSale({
      ...base,
      canOverridePrice: true,
      items: [{ productId: "p1", unitPrice: "45.00", quantity: 2 }],
    });
    expect(sale.lines[0]!.unitPrice).toBe(4500);
    expect(sale.lines[0]!.unitCost).toBe(4000);
  });

  it("applies line and sale discounts and keeps integers", () => {
    const sale = computeSale({
      ...base,
      canOverridePrice: true,
      saleDiscount: "10.00",
      items: [
        { productId: "p1", unitPrice: "50.00", quantity: 2, discountAmount: "5.00" },
        { productId: "p2", unitPrice: "120.00", quantity: 1 },
      ],
    });
    expect(sale.subtotal).toBe(9500 + 12000);
    expect(sale.finalTotal).toBe(9500 + 12000 - 1000);
  });

  it("rejects bad money strings instead of producing NaN totals", () => {
    for (const bad of ["abc", "-5", "1e3", "1.234", "", " "]) {
      expect(() => parseMoneyStrict(bad === " " ? "" : bad, "ETB", "x")).toThrow(SaleMathError);
    }
  });

  it("rejects discounts above the line or the subtotal", () => {
    expect(() =>
      computeSale({ ...base, canOverridePrice: true, items: [{ productId: "p1", unitPrice: "50", quantity: 1, discountAmount: "50.01" }] }),
    ).toThrow(SaleMathError);
    expect(() =>
      computeSale({ ...base, canOverridePrice: true, saleDiscount: "50.01", items: [{ productId: "p1", unitPrice: "50", quantity: 1 }] }),
    ).toThrow(SaleMathError);
  });

  it("rejects empty carts, unknown products and fractional/zero quantities", () => {
    expect(() => computeSale({ ...base, canOverridePrice: true, items: [] })).toThrow(SaleMathError);
    expect(() => computeSale({ ...base, canOverridePrice: true, items: [{ productId: "x", unitPrice: "1", quantity: 1 }] })).toThrow(SaleMathError);
    expect(() => computeSale({ ...base, canOverridePrice: true, items: [{ productId: "p1", unitPrice: "1", quantity: 1.5 }] })).toThrow(SaleMathError);
    expect(() => computeSale({ ...base, canOverridePrice: true, items: [{ productId: "p1", unitPrice: "1", quantity: 0 }] })).toThrow(SaleMathError);
  });
});

describe("totalQuantityByProduct — regression: duplicate lines must not bypass stock checks", () => {
  it("sums the same product across lines", () => {
    const totals = totalQuantityByProduct([
      { productId: "p1", quantity: 3 },
      { productId: "p1", quantity: 4 },
      { productId: "p2", quantity: 1 },
    ]);
    expect(totals.get("p1")).toBe(7);
    expect(totals.get("p2")).toBe(1);
  });
});
