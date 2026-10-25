/**
 * CSV builders for the standard reports — SERVER ONLY (types come from the
 * report service). Pure functions of already-authorized report data: permission,
 * plan and tenant checks happen in the report service and the export route.
 * Money is written as plain decimals (no currency symbols or grouping) so it
 * opens cleanly in spreadsheets; the currency is named in each header.
 */
import "server-only";
import { bpsToPercent, csvRow, MANAGEMENT_REPORT_NOTE, minorToDecimal as m } from "@shared/csv";
import type {
  ExpensesReport,
  InventoryReport,
  ProfitReport,
  SalesReport,
} from "@server/services/report.service";

const join = (lines: string[]) => lines.join("\r\n") + "\r\n";
const period = (p: { fromKey: string; toKey: string }) => csvRow([`Period: ${p.fromKey} to ${p.toKey}`, MANAGEMENT_REPORT_NOTE]);

export function salesReportToCsv(r: SalesReport, c: string): string {
  const t = r.totals;
  return join([
    period(r.period),
    "",
    csvRow(["Summary", `Amount (${c})`]),
    csvRow(["Sales", m(t.sales)]),
    csvRow(["Refunds", m(t.refunds)]),
    csvRow(["Net sales", m(t.netSales)]),
    csvRow(["Discounts given", m(t.discounts)]),
    csvRow(["Number of sales", t.salesCount]),
    csvRow(["Number of returns", t.returnsCount]),
    csvRow(["Average sale", m(t.averageSale)]),
    "",
    csvRow(["Date", `Sales (${c})`, `Refunds (${c})`, `Net (${c})`, "Number of sales"]),
    ...r.daily.map((d) => csvRow([d.date, m(d.sales), m(d.refunds), m(d.net), d.count])),
    "",
    csvRow(["Account", "Type", `Received (${c})`, `Refunded (${c})`, `Net (${c})`]),
    ...r.byAccount.map((a) => csvRow([a.accountName, a.accountType, m(a.received), m(a.refunded), m(a.net)])),
  ]);
}

export function profitReportToCsv(r: ProfitReport, c: string): string {
  return join([
    period(r.period),
    "",
    csvRow(["Line", `Amount (${c})`]),
    csvRow(["Sales", m(r.sales)]),
    csvRow(["Refunds", m(r.refunds)]),
    csvRow(["Revenue (net sales)", m(r.netSales)]),
    csvRow(["Cost of goods sold", m(r.cogs)]),
    csvRow(["Gross profit", m(r.grossProfit)]),
    csvRow(["Operating expenses", m(r.expenses)]),
    csvRow(["Net operating profit", m(r.operatingProfit)]),
    csvRow(["Operating margin %", r.netSales > 0 ? bpsToPercent(Math.round((r.operatingProfit * 10_000) / r.netSales)) : ""]),
  ]);
}

export function expensesReportToCsv(r: ExpensesReport, c: string): string {
  return join([
    period(r.period),
    "",
    csvRow(["Total expenses", m(r.total)]),
    "",
    csvRow(["Category", `Total (${c})`]),
    ...r.byCategory.map((x) => csvRow([x.categoryName, m(x.total)])),
    "",
    csvRow(["Paid from account", `Total (${c})`]),
    ...r.byAccount.map((x) => csvRow([x.accountName, m(x.total)])),
    "",
    csvRow(["Date", `Total (${c})`]),
    ...r.daily.map((x) => csvRow([x.date, m(x.total)])),
  ]);
}

/** `includeValuation` false = quantities only (plans without valuation). */
export function inventoryReportToCsv(r: InventoryReport, c: string, includeValuation: boolean): string {
  const header = ["Product", "SKU", "Quantity", "Reorder level", "Status"];
  if (includeValuation) header.push(`Average cost (${c})`, `Stock value (${c})`);
  return join([
    csvRow(["Stock at the time of export", MANAGEMENT_REPORT_NOTE]),
    "",
    csvRow(header),
    ...r.items.map((i) => {
      const status = i.isOutOfStock ? "Out of stock" : i.isLowStock ? "Low stock" : "OK";
      const row: (string | number | null)[] = [i.productName, i.sku, i.quantity, i.minStockLevel, status];
      if (includeValuation) row.push(m(i.costPrice), m(i.inventoryValue));
      return csvRow(row);
    }),
    ...(includeValuation ? ["", csvRow(["Total stock value", m(r.totalValue)])] : []),
  ]);
}
