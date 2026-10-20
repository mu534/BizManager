import { describe, it, expect } from "vitest";
import { computeWeightedAverageCost, inventoryValue } from "@shared/costing";

describe("computeWeightedAverageCost", () => {
  it("averages 10 @ 100 and 10 @ 120 to 110 (spec example, minor units)", () => {
    expect(
      computeWeightedAverageCost({
        onHandQuantity: 10,
        currentUnitCost: 10_000,
        receivedQuantity: 10,
        receivedUnitCost: 12_000,
      }),
    ).toBe(11_000);
  });

  it("uses the receipt cost when nothing is on hand", () => {
    expect(
      computeWeightedAverageCost({
        onHandQuantity: 0,
        currentUnitCost: 5_000,
        receivedQuantity: 4,
        receivedUnitCost: 7_000,
      }),
    ).toBe(7_000);
  });

  it("weights by quantity, not simple mean", () => {
    // 90 @ 100.00 + 10 @ 200.00 => 110.00
    expect(
      computeWeightedAverageCost({
        onHandQuantity: 90,
        currentUnitCost: 10_000,
        receivedQuantity: 10,
        receivedUnitCost: 20_000,
      }),
    ).toBe(11_000);
  });

  it("rounds half up without floating point", () => {
    // (1*1 + 1*2) / 2 = 1.5 -> 2
    expect(
      computeWeightedAverageCost({
        onHandQuantity: 1,
        currentUnitCost: 1,
        receivedQuantity: 1,
        receivedUnitCost: 2,
      }),
    ).toBe(2);
  });

  it("stays exact for large values", () => {
    expect(
      computeWeightedAverageCost({
        onHandQuantity: 1_000_000,
        currentUnitCost: 9_999_999,
        receivedQuantity: 1_000_000,
        receivedUnitCost: 9_999_999,
      }),
    ).toBe(9_999_999);
  });

  it("rejects invalid input", () => {
    expect(() =>
      computeWeightedAverageCost({
        onHandQuantity: -1,
        currentUnitCost: 1,
        receivedQuantity: 1,
        receivedUnitCost: 1,
      }),
    ).toThrow(RangeError);
    expect(() =>
      computeWeightedAverageCost({
        onHandQuantity: 1,
        currentUnitCost: 1,
        receivedQuantity: 0,
        receivedUnitCost: 1,
      }),
    ).toThrow(RangeError);
    expect(() =>
      computeWeightedAverageCost({
        onHandQuantity: 1,
        currentUnitCost: 1.5,
        receivedQuantity: 1,
        receivedUnitCost: 1,
      }),
    ).toThrow(RangeError);
  });
});

describe("inventoryValue", () => {
  it("multiplies exactly", () => {
    expect(inventoryValue(20, 11_000)).toBe(220_000);
    expect(inventoryValue(0, 11_000)).toBe(0);
  });
});
