import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@server/db/prisma", () => ({ prisma: {} }));
vi.mock("@server/auth/permissions", () => ({ requireFinancialReports: vi.fn() }));
vi.mock("@server/services/subscription.service", () => ({ requireFeature: vi.fn(), FEATURE_KEYS: { ADVANCED_REPORTS: "ADVANCED_REPORTS" } }));
vi.mock("@server/services/business-time", () => ({ getBusinessTime: vi.fn() }));
vi.mock("@server/services/report.service", () => ({ getBranchIds: vi.fn() }));

import { csvCell, minorToDecimal, productReportToCsv } from "@server/services/product-report.service";

describe("csvCell", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });
  it("neutralises spreadsheet formula injection in text", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
  });
  it("leaves numbers (including negatives) and null alone", () => {
    expect(csvCell(-50)).toBe("-50");
    expect(csvCell(12)).toBe("12");
    expect(csvCell(null)).toBe("");
  });
});

describe("minorToDecimal", () => {
  it("formats without floating point", () => {
    expect(minorToDecimal(123_456)).toBe("1234.56");
    expect(minorToDecimal(5)).toBe("0.05");
    expect(minorToDecimal(-50)).toBe("-0.50");
    expect(minorToDecimal(0)).toBe("0.00");
  });
});

describe("productReportToCsv", () => {
  it("emits period, header, rows and a total, with CRLF line endings", () => {
    const csv = productReportToCsv(
      {
        period: { fromKey: "2026-10-01", toKey: "2026-10-18" },
        sortBy: "profit",
        rows: [{ productId: "a", productName: "=Cotton, shirt", productSku: "SH-1", unitsSold: 10, revenue: 600_000, cogs: 400_000, profit: 200_000, marginBps: 3_333, profitShareBps: 10_000 }],
        totals: { unitsSold: 10, revenue: 600_000, cogs: 400_000, profit: 200_000 },
      },
      "ETB",
    );
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toContain("2026-10-01 to 2026-10-18");
    expect(lines[1]).toContain("Revenue (ETB)");
    expect(lines[2]).toBe(`"'=Cotton, shirt",SH-1,10,6000.00,4000.00,2000.00,33.33,100.00`);
    expect(lines[3]).toBe("Total,,10,6000.00,4000.00,2000.00,,");
  });
});
