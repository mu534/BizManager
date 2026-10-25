/**
 * Report service — SERVER ONLY.
 *
 * ONE definition of period financials (see src/shared/profit.ts) is used by
 * every report and the dashboard, so figures always agree. Previously the
 * sales report counted only COMPLETED sales, the profit report counted
 * COMPLETED + PARTIALLY_RETURNED, fully-returned sales vanished from revenue
 * while their refunds were still subtracted, daily buckets were per-timestamp
 * and "today" was a UTC day.
 *
 * Distinctions preserved: revenue ≠ cash balance; transfers are never revenue
 * or expense; inventory purchases are never expenses; inventory value ≠ profit.
 * Every report is financial data and requires OWNER/MANAGER.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@server/db/prisma";
import { listAccessibleBranches, requireBranchAccess } from "@server/services/branch-access.service";
import { requireFeature, FEATURE_KEYS } from "@server/services/subscription.service";
import { appError } from "@shared/errors";
import { requireFinancialReports } from "@server/auth/permissions";
import { getBusinessTime } from "@server/services/business-time";
import {
  bucketDaily,
  computeProfit,
  REVENUE_SALE_STATUSES,
  type DailyPoint,
  type ProfitResult,
} from "@shared/profit";
import {
  businessDayKey,
  enumerateDays,
  previousPeriod,
  resolvePeriod,
  type ResolvedPeriod,
} from "@shared/time";
import { buildProfitComparison, type ComparisonRow } from "@shared/comparison";
import { buildBranchComparison, type BranchComparison } from "@shared/branch-report";
import type { TenantContext } from "@shared/types/auth.types";
import type { ReportFilterInput } from "@shared/validation/report.schema";

// ─── Types ─────────────────────────────────────────────────

export interface PeriodInfo {
  fromKey: string;
  toKey: string;
}

export interface PeriodFinancials extends ProfitResult {
  salesCount: number;
  returnsCount: number;
  discounts: number;
  daily: DailyPoint[];
}

export interface SalesReport {
  period: PeriodInfo;
  totals: {
    sales: number;
    refunds: number;
    netSales: number;
    discounts: number;
    salesCount: number;
    returnsCount: number;
    averageSale: number;
  };
  daily: DailyPoint[];
  byAccount: { accountName: string; accountType: string; received: number; refunded: number; net: number }[];
}

export interface ProfitReport extends ProfitResult {
  period: PeriodInfo;
}

export interface InventoryReportItem {
  productId: string;
  productName: string;
  sku: string | null;
  quantity: number;
  costPrice: number;
  inventoryValue: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
  minStockLevel: number;
}

export interface InventoryReport {
  items: InventoryReportItem[];
  totalValue: number;
  lowStockCount: number;
  outOfStockCount: number;
}

export interface ExpensesReport {
  period: PeriodInfo;
  total: number;
  byCategory: { categoryName: string; total: number }[];
  daily: { date: string; total: number }[];
  byAccount: { accountName: string; total: number }[];
}

// ─── Helpers ───────────────────────────────────────────────

export async function getBranchIds(ctx: TenantContext, branchId?: string): Promise<string[]> {
  if (branchId) {
    await requireBranchAccess(ctx, branchId);
    return [branchId];
  }
  // Consolidated: every branch this member may see — INCLUDING inactive ones,
  // so closing a branch never removes its history from the totals.
  return (await listAccessibleBranches(ctx)).map((b) => b.id);
}

async function resolve(ctx: TenantContext, filters: ReportFilterInput) {
  const biz = await getBusinessTime(ctx.businessId);
  const period = resolvePeriod(filters, biz.offsetMinutes);
  return { biz, period };
}

/**
 * Shared computation behind the dashboard and the sales/profit reports.
 * `withCost` skips the (heavier) cost queries for roles that never see profit.
 */
export async function computePeriodFinancials(
  branchIds: string[],
  period: ResolvedPeriod,
  offsetMinutes: number,
  opts: { withCost: boolean },
): Promise<PeriodFinancials> {
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

  const [sales, returns, soldItems, returnedItems, expenseAgg] = await Promise.all([
    prisma.sale.findMany({
      where: saleWhere,
      select: { createdAt: true, finalTotal: true, discountAmount: true },
    }),
    prisma.saleReturn.findMany({
      where: returnWhere,
      select: { createdAt: true, totalRefund: true },
    }),
    opts.withCost
      ? prisma.saleItem.findMany({
          where: { sale: saleWhere },
          select: { unitCost: true, quantity: true },
        })
      : Promise.resolve([]),
    opts.withCost
      ? prisma.saleReturnItem.findMany({
          where: { stockDisposition: "RESTOCK", saleReturn: returnWhere },
          select: { quantity: true, saleItem: { select: { unitCost: true } } },
        })
      : Promise.resolve([]),
    opts.withCost
      ? prisma.expense.aggregate({
          where: {
            branchId: { in: branchIds },
            deletedAt: null,
            expenseDate: { gte: period.fromDate, lte: period.toDate },
          },
          _sum: { amount: true },
        })
      : Promise.resolve(null),
  ]);

  const salesTotal = sales.reduce((s, r) => s + r.finalTotal, 0);
  const refundsTotal = returns.reduce((s, r) => s + r.totalRefund, 0);

  const profit = computeProfit({
    sales: salesTotal,
    refunds: refundsTotal,
    soldCost: soldItems.reduce((s, i) => s + i.unitCost * i.quantity, 0),
    restockedReturnCost: returnedItems.reduce((s, i) => s + i.saleItem.unitCost * i.quantity, 0),
    expenses: expenseAgg?._sum.amount ?? 0,
  });

  const days = enumerateDays(period.fromKey, period.toKey);
  const daily = bucketDaily(
    days,
    sales.map((r) => ({ day: businessDayKey(r.createdAt, offsetMinutes), amount: r.finalTotal })),
    returns.map((r) => ({ day: businessDayKey(r.createdAt, offsetMinutes), amount: r.totalRefund })),
  );

  return {
    ...profit,
    salesCount: sales.length,
    returnsCount: returns.length,
    discounts: sales.reduce((s, r) => s + r.discountAmount, 0),
    daily,
  };
}

// ─── Reports ───────────────────────────────────────────────

export async function getSalesReport(
  ctx: TenantContext,
  filters: ReportFilterInput,
): Promise<SalesReport> {
  requireFinancialReports(ctx);
  const { biz, period } = await resolve(ctx, filters);
  const branchIds = await getBranchIds(ctx, filters.branchId);
  const f = await computePeriodFinancials(branchIds, period, biz.offsetMinutes, { withCost: false });

  const saleWhere: Prisma.SaleWhereInput = {
    branchId: { in: branchIds },
    status: { in: [...REVENUE_SALE_STATUSES] },
    deletedAt: null,
    createdAt: { gte: period.from, lte: period.to },
  };
  const [received, refunded] = await Promise.all([
    prisma.payment.groupBy({ by: ["accountId"], where: { sale: saleWhere }, _sum: { amount: true } }),
    prisma.saleReturn.groupBy({
      by: ["refundAccountId"],
      where: {
        branchId: { in: branchIds },
        status: "COMPLETED",
        createdAt: { gte: period.from, lte: period.to },
      },
      _sum: { totalRefund: true },
    }),
  ]);

  const accountIds = [
    ...new Set([
      ...received.map((r) => r.accountId),
      ...refunded.flatMap((r) => (r.refundAccountId ? [r.refundAccountId] : [])),
    ]),
  ];
  const accounts = await prisma.financialAccount.findMany({
    where: { id: { in: accountIds }, businessId: ctx.businessId },
    select: { id: true, name: true, type: true },
  });
  const byAccount = accounts.map((a) => {
    const rec = received.find((r) => r.accountId === a.id)?._sum.amount ?? 0;
    const ref = refunded.find((r) => r.refundAccountId === a.id)?._sum.totalRefund ?? 0;
    return { accountName: a.name, accountType: a.type, received: rec, refunded: ref, net: rec - ref };
  });

  return {
    period: { fromKey: period.fromKey, toKey: period.toKey },
    totals: {
      sales: f.sales,
      refunds: f.refunds,
      netSales: f.netSales,
      discounts: f.discounts,
      salesCount: f.salesCount,
      returnsCount: f.returnsCount,
      averageSale: f.salesCount > 0 ? Math.round(f.sales / f.salesCount) : 0,
    },
    daily: f.daily,
    byAccount,
  };
}

/**
 * Operating profit estimate: Net sales − COGS − Expenses (rules in profit.ts).
 * Not an accounting statement; no tax, depreciation or non-operating items.
 */
export async function getProfitReport(
  ctx: TenantContext,
  filters: ReportFilterInput,
): Promise<ProfitReport> {
  requireFinancialReports(ctx);
  const { biz, period } = await resolve(ctx, filters);
  const branchIds = await getBranchIds(ctx, filters.branchId);
  const f = await computePeriodFinancials(branchIds, period, biz.offsetMinutes, { withCost: true });
  const { salesCount: _a, returnsCount: _b, discounts: _c, daily: _d, ...profit } = f;
  return { period: { fromKey: period.fromKey, toKey: period.toKey }, ...profit };
}

export interface BranchComparisonReport extends BranchComparison {
  period: PeriodInfo;
}

/**
 * Compare branches side by side for one period. Business plan. Only branches the
 * member may see are included (inactive ones too, so history is never dropped),
 * and each branch uses computePeriodFinancials — the same calculation as every
 * other report — so the totals equal the consolidated profit report.
 */
export async function getBranchComparisonReport(
  ctx: TenantContext,
  filters: ReportFilterInput,
): Promise<BranchComparisonReport> {
  requireFinancialReports(ctx);
  await requireFeature(ctx, FEATURE_KEYS.MULTI_BRANCH);
  const { biz, period } = await resolve(ctx, filters);
  const branches = await listAccessibleBranches(ctx);

  const rows = await Promise.all(
    branches.map(async (b) => {
      const f = await computePeriodFinancials([b.id], period, biz.offsetMinutes, { withCost: true });
      return {
        branchId: b.id,
        branchName: b.name,
        closed: b.status !== "ACTIVE",
        salesCount: f.salesCount,
        netSales: f.netSales,
        cogs: f.cogs,
        grossProfit: f.grossProfit,
        expenses: f.expenses,
        operatingProfit: f.operatingProfit,
      };
    }),
  );
  return { period: { fromKey: period.fromKey, toKey: period.toKey }, ...buildBranchComparison(rows) };
}

export interface ProfitComparison {
  current: ProfitReport;
  previous: ProfitReport;
  rows: ComparisonRow[];
}

/**
 * Profit for the selected period next to the equal-length period immediately
 * before it. Both sides use computePeriodFinancials, the same function as the
 * profit report, so the numbers always reconcile. Pro feature.
 */
export async function getProfitComparison(
  ctx: TenantContext,
  filters: ReportFilterInput,
): Promise<ProfitComparison> {
  requireFinancialReports(ctx);
  await requireFeature(ctx, FEATURE_KEYS.ADVANCED_REPORTS);
  const { biz, period } = await resolve(ctx, filters);
  const prevPeriod = previousPeriod(period, biz.offsetMinutes);
  const branchIds = await getBranchIds(ctx, filters.branchId);

  const [cur, prev] = await Promise.all([
    computePeriodFinancials(branchIds, period, biz.offsetMinutes, { withCost: true }),
    computePeriodFinancials(branchIds, prevPeriod, biz.offsetMinutes, { withCost: true }),
  ]);
  const strip = (f: PeriodFinancials, p: { fromKey: string; toKey: string }): ProfitReport => {
    const { salesCount: _a, returnsCount: _b, discounts: _c, daily: _d, ...profit } = f;
    return { period: { fromKey: p.fromKey, toKey: p.toKey }, ...profit };
  };
  const current = strip(cur, period);
  const previous = strip(prev, prevPeriod);
  return { current, previous, rows: buildProfitComparison(current, previous) };
}

/** Current stock and valuation. Includes products that have never been stocked (qty 0). */
export async function getInventoryReport(
  ctx: TenantContext,
  branchId?: string,
  opts: { includeValuation?: boolean } = {},
): Promise<InventoryReport> {
  const targetBranchId = branchId ?? ctx.branchId;
  if (!targetBranchId) throw appError.validationError("Branch is required.");
  const branch = await prisma.branch.findUnique({ where: { id: targetBranchId } });
  if (!branch || branch.businessId !== ctx.businessId) {
    throw appError.tenantViolation("Branch does not belong to this business.");
  }
  // Valuation exposes cost prices: financial permission required.
  const includeValuation = opts.includeValuation ?? true;
  if (includeValuation) {
    requireFinancialReports(ctx);
    // Inventory valuation is a Pro feature (stock levels and low stock are not).
    await requireFeature(ctx, FEATURE_KEYS.ADVANCED_REPORTS);
  }

  const products = await prisma.product.findMany({
    where: { businessId: ctx.businessId, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      sku: true,
      costPrice: true,
      minStockLevel: true,
      stockSnapshots: { where: { branchId: targetBranchId }, select: { quantity: true } },
    },
    orderBy: { name: "asc" },
  });

  const items: InventoryReportItem[] = products.map((p) => {
    const quantity = p.stockSnapshots[0]?.quantity ?? 0;
    return {
      productId: p.id,
      productName: p.name,
      sku: p.sku,
      quantity,
      costPrice: includeValuation ? p.costPrice : 0,
      inventoryValue: includeValuation ? p.costPrice * Math.max(0, quantity) : 0,
      isLowStock: quantity <= p.minStockLevel,
      isOutOfStock: quantity <= 0,
      minStockLevel: p.minStockLevel,
    };
  });

  return {
    items,
    totalValue: items.reduce((s, i) => s + i.inventoryValue, 0),
    lowStockCount: items.filter((i) => i.isLowStock).length,
    outOfStockCount: items.filter((i) => i.isOutOfStock).length,
  };
}

export async function getExpensesReport(
  ctx: TenantContext,
  filters: ReportFilterInput,
): Promise<ExpensesReport> {
  requireFinancialReports(ctx);
  // Expense-category analysis is a Pro feature (recording expenses is not).
  await requireFeature(ctx, FEATURE_KEYS.ADVANCED_REPORTS);
  const { period } = await resolve(ctx, filters);
  const branchIds = await getBranchIds(ctx, filters.branchId);

  const where: Prisma.ExpenseWhereInput = {
    branchId: { in: branchIds },
    deletedAt: null,
    expenseDate: { gte: period.fromDate, lte: period.toDate },
  };

  const [totalResult, byCategoryRaw, dailyRaw, byAccountRaw] = await Promise.all([
    prisma.expense.aggregate({ where, _sum: { amount: true } }),
    prisma.expense.groupBy({ by: ["categoryId"], where, _sum: { amount: true } }),
    prisma.expense.groupBy({ by: ["expenseDate"], where, _sum: { amount: true }, orderBy: { expenseDate: "asc" } }),
    prisma.expense.groupBy({ by: ["accountId"], where, _sum: { amount: true } }),
  ]);

  const [categories, accounts] = await Promise.all([
    prisma.expenseCategory.findMany({
      where: { id: { in: byCategoryRaw.map((r) => r.categoryId) }, businessId: ctx.businessId },
      select: { id: true, name: true },
    }),
    prisma.financialAccount.findMany({
      where: { id: { in: byAccountRaw.map((r) => r.accountId) }, businessId: ctx.businessId },
      select: { id: true, name: true },
    }),
  ]);
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const accName = new Map(accounts.map((a) => [a.id, a.name]));

  return {
    period: { fromKey: period.fromKey, toKey: period.toKey },
    total: totalResult._sum.amount ?? 0,
    byCategory: byCategoryRaw
      .map((r) => ({ categoryName: catName.get(r.categoryId) ?? "Unknown", total: r._sum.amount ?? 0 }))
      .sort((a, b) => b.total - a.total),
    daily: dailyRaw.map((r) => ({ date: r.expenseDate.toISOString().slice(0, 10), total: r._sum.amount ?? 0 })),
    byAccount: byAccountRaw.map((r) => ({ accountName: accName.get(r.accountId) ?? "Unknown", total: r._sum.amount ?? 0 })),
  };
}
