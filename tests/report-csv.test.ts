import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { expensesReportToCsv, inventoryReportToCsv, profitReportToCsv, salesReportToCsv } from "@server/services/report-csv";
import type { ExpensesReport, InventoryReport, ProfitReport, SalesReport } from "@server/services/report.service";
import { bpsToPercent, csvCell, csvRow, minorToDecimal } from "@shared/csv";

const period = { fromKey: "2026-10-01", toKey: "2026-10-18" };
const lines = (csv: string) => csv.trim().split("\r\n");

describe("profit CSV", () => {
  const r: ProfitReport = { period, sales: 1_000_000, refunds: 0, netSales: 1_000_000, cogs: 600_000, grossProfit: 400_000, expenses: 100_000, operatingProfit: 300_000 };

  it("reproduces the spec example and labels the currency", () => {
    const l = lines(profitReportToCsv(r, "ETB"));
    expect(l[0]).toContain("2026-10-01 to 2026-10-18");
    expect(l).toContain("Line,Amount (ETB)");
    expect(l).toContain("Revenue (net sales),10000.00");
    expect(l).toContain("Cost of goods sold,6000.00");
    expect(l).toContain("Gross profit,4000.00");
    expect(l).toContain("Operating expenses,1000.00");
    expect(l).toContain("Net operating profit,3000.00");
    expect(l).toContain("Operating margin %,30.00");
  });

  it("leaves margin blank, not 0 or Infinity, when there was no revenue", () => {
    const l = lines(profitReportToCsv({ ...r, sales: 0, netSales: 0, cogs: 0, grossProfit: 0, expenses: 500, operatingProfit: -500 }, "ETB"));
    expect(l).toContain("Operating margin %,");
    expect(l).toContain("Net operating profit,-5.00");
  });
});

describe("sales CSV", () => {
  const r: SalesReport = {
    period,
    totals: { sales: 500_000, refunds: 50_000, netSales: 450_000, discounts: 10_000, salesCount: 5, returnsCount: 1, averageSale: 100_000 },
    daily: [{ date: "2026-10-01", sales: 500_000, refunds: 50_000, net: 450_000, count: 5 }],
    byAccount: [{ accountName: "=Cash, main", accountType: "CASH", received: 500_000, refunded: 50_000, net: 450_000 }],
  };

  it("includes summary, daily and per-account sections with exact decimals", () => {
    const csv = salesReportToCsv(r, "ETB");
    expect(csv).toContain("Net sales,4500.00");
    expect(csv).toContain("2026-10-01,5000.00,500.00,4500.00,5");
  });

  it("neutralises formula injection and quotes commas in account names", () => {
    expect(salesReportToCsv(r, "ETB")).toContain(`"'=Cash, main",CASH,5000.00,500.00,4500.00`);
  });
});

describe("expenses CSV", () => {
  it("lists totals by category, account and day", () => {
    const r: ExpensesReport = {
      period,
      total: 150_000,
      byCategory: [{ categoryName: "Rent", total: 100_000 }, { categoryName: "Electricity", total: 50_000 }],
      byAccount: [{ accountName: "Cash", total: 150_000 }],
      daily: [{ date: "2026-10-02", total: 150_000 }],
    };
    const l = lines(expensesReportToCsv(r, "ETB"));
    expect(l).toContain("Total expenses,1500.00");
    expect(l).toContain("Rent,1000.00");
    expect(l).toContain("2026-10-02,1500.00");
  });
});

describe("inventory CSV", () => {
  const r: InventoryReport = {
    items: [
      { productId: "a", productName: "Shirt", sku: "SH-1", quantity: 0, costPrice: 40_000, inventoryValue: 0, isLowStock: false, isOutOfStock: true, minStockLevel: 3 },
      { productId: "b", productName: "Shoes", sku: null, quantity: 2, costPrice: 110_000, inventoryValue: 220_000, isLowStock: true, isOutOfStock: false, minStockLevel: 5 },
    ],
    totalValue: 220_000,
    lowStockCount: 1,
    outOfStockCount: 1,
  };

  it("with valuation (Pro): includes cost, value and the total", () => {
    const csv = inventoryReportToCsv(r, "ETB", true);
    expect(csv).toContain("Average cost (ETB),Stock value (ETB)");
    expect(csv).toContain("Shoes,,2,5,Low stock,1100.00,2200.00");
    expect(csv).toContain("Total stock value,2200.00");
  });

  it("without valuation (Basic): quantities and status only — no cost or value leaks", () => {
    const csv = inventoryReportToCsv(r, "ETB", false);
    expect(csv).not.toMatch(/cost|value|1100\.00|2200\.00/i);
    expect(csv).toContain("Shirt,SH-1,0,3,Out of stock");
  });
});

describe("csv primitives", () => {
  it("formats decimals and percentages without floating point", () => {
    expect(minorToDecimal(5)).toBe("0.05");
    expect(minorToDecimal(-123_456)).toBe("-1234.56");
    expect(bpsToPercent(3_333)).toBe("33.33");
    expect(bpsToPercent(-250)).toBe("-2.50");
    expect(bpsToPercent(null)).toBe("");
  });
  it("quotes and neutralises", () => {
    expect(csvRow(["a,b", '=1+1', null, 5])).toBe(`"a,b",'=1+1,,5`);
    expect(csvCell(-5)).toBe("-5");
  });
});
