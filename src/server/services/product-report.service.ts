/**
 * Product performance report — SERVER ONLY.
 *
 * Access: financial-report permission (owner, or a manager the owner granted)
 * AND the plan's ADVANCED_REPORTS feature. Uses exactly the same period, branch
 * and sale-status rules as the profit report so the totals reconcile with it.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@server/db/prisma";
import { appError } from "@shared/errors";
import { requireFinancialReports } from "@server/auth/permissions";
import { requireFeature, FEATURE_KEYS } from "@server/services/subscription.service";
import { getBusinessTime } from "@server/services/business-time";
import { getBranchIds, type PeriodInfo } from "@server/services/report.service";
import { REVENUE_SALE_STATUSES } from "@shared/profit";
import { resolvePeriod } from "@shared/time";
import {
  computeProductPerformance,
  type ProductPerformance,
  type ReturnedLine,
  type SoldLine,
  type SortKey,
} from "@shared/product-performance";
import type { TenantContext } from "@shared/types/auth.types";
import type { ReportFilterInput } from "@shared/validation/report.schema";

/** Safety cap so one request cannot load an unbounded number of sale lines. */
const MAX_LINES = 50_000;

export interface ProductPerformanceReport extends ProductPerformance {
  period: PeriodInfo;
  sortBy: SortKey;
}

export async function getProductPerformanceReport(
  ctx: TenantContext,
  filters: ReportFilterInput,
  sortBy: SortKey = "profit",
): Promise<ProductPerformanceReport> {
  requireFinancialReports(ctx);
  await requireFeature(ctx, FEATURE_KEYS.ADVANCED_REPORTS);

  const biz = await getBusinessTime(ctx.businessId);
  const period = resolvePeriod(filters, biz.offsetMinutes);
  // Tenant guard: branch ids are verified to belong to ctx.businessId.
  const branchIds = await getBranchIds(ctx, filters.branchId);

  const saleWhere: Prisma.SaleWhereInput = {
    branchId: { in: branchIds },
    status: { in: [...REVENUE_SALE_STATUSES] },
    deletedAt: null,
    createdAt: { gte: period.from, lte: period.to },
  };
  const returnWhere: Prisma.SaleReturnWhereInput = {
    branchId: { in: branchIds },
    status: "COMPLETED",
    createdAt: { gte: period.from, lte: period.to },
  };

  const [items, returned] = await Promise.all([
    prisma.saleItem.findMany({
      where: { sale: saleWhere },
      take: MAX_LINES + 1,
      select: {
        saleId: true,
        productId: true,
        productName: true,
        productSku: true,
        quantity: true,
        unitCost: true,
        lineTotal: true,
        sale: { select: { discountAmount: true } },
      },
    }),
    prisma.saleReturnItem.findMany({
      where: { saleReturn: returnWhere },
      take: MAX_LINES + 1,
      select: {
        quantity: true,
        refundAmount: true,
        stockDisposition: true,
        saleItem: { select: { productId: true, productName: true, productSku: true, unitCost: true } },
      },
    }),
  ]);

  if (items.length > MAX_LINES || returned.length > MAX_LINES) {
    throw appError.validationError("That period has too many transactions for this report. Choose a shorter date range.");
  }

  const saleDiscounts = new Map<string, number>();
  const lines: SoldLine[] = items.map((i) => {
    saleDiscounts.set(i.saleId, i.sale.discountAmount);
    return {
      saleId: i.saleId,
      productId: i.productId,
      productName: i.productName,
      productSku: i.productSku,
      quantity: i.quantity,
      unitCost: i.unitCost,
      lineTotal: i.lineTotal,
    };
  });
  const returns: ReturnedLine[] = returned.map((r) => ({
    productId: r.saleItem.productId,
    productName: r.saleItem.productName,
    productSku: r.saleItem.productSku,
    quantity: r.quantity,
    refundAmount: r.refundAmount,
    unitCost: r.saleItem.unitCost,
    restocked: r.stockDisposition === "RESTOCK",
  }));

  return {
    period: { fromKey: period.fromKey, toKey: period.toKey },
    sortBy,
    ...computeProductPerformance({ lines, saleDiscounts, returns, sortBy }),
  };
}

// ─── CSV export ───────────────────────────────────────────────────────────

/** Neutralise spreadsheet formula injection and quote per RFC 4180. */
export function csvCell(value: string | number | null): string {
  if (value === null) return "";
  let s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Major-unit decimal string from minor units, without floating point. */
export function minorToDecimal(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function productReportToCsv(report: ProductPerformanceReport, currency: string): string {
  const header = ["Product", "SKU", "Units sold (net)", `Revenue (${currency})`, `Cost of goods sold (${currency})`, `Gross profit (${currency})`, "Margin %", "Share of profit %"];
  const pct = (bps: number | null) => (bps === null ? "" : `${Math.floor(bps / 100)}.${String(Math.abs(bps) % 100).padStart(2, "0")}`);
  const rows = report.rows.map((r) =>
    [r.productName, r.productSku, r.unitsSold, minorToDecimal(r.revenue), minorToDecimal(r.cogs), minorToDecimal(r.profit), pct(r.marginBps), pct(r.profitShareBps)]
      .map(csvCell)
      .join(","),
  );
  const t = report.totals;
  const total = ["Total", null, t.unitsSold, minorToDecimal(t.revenue), minorToDecimal(t.cogs), minorToDecimal(t.profit), "", ""].map(csvCell).join(",");
  const meta = [`Period: ${report.period.fromKey} to ${report.period.toKey}`, "Management report — not a certified accounting statement"].map(csvCell).join(",");
  return [meta, header.map(csvCell).join(","), ...rows, total].join("\r\n") + "\r\n";
}
