/**
 * Report service — SERVER ONLY.
 *
 * All reports use Prisma aggregations — no row-by-row JS summation.
 * Reports are derived from authoritative transactional records.
 *
 * Financial distinctions preserved:
 *   - Revenue ≠ Cash balance
 *   - Transfers (TRANSFER_IN/OUT) are NOT revenue or expenses
 *   - Returns reduce revenue and COGS correctly
 *   - Inventory value ≠ Profit
 */
import "server-only";
import { prisma } from "@server/db/prisma";
import { appError } from "@shared/errors";
import type { TenantContext } from "@shared/types/auth.types";
import type { ReportFilterInput } from "@shared/validation/report.schema";
import { resolveReportDates } from "@shared/validation/report.schema";

// ─── Types ─────────────────────────────────────────────────

export interface SalesReport {
  totalRevenue: number;
  salesCount: number;
  totalDiscounts: number;
  dailyBreakdown: { date: string; revenue: number; count: number }[];
  byAccount: { accountName: string; accountType: string; amount: number }[];
}

export interface ProfitReport {
  revenue: number;
  cogs: number;
  grossProfit: number;
  operatingExpenses: number;
  netOperatingProfit: number;
  note: string;
}

export interface InventoryReport {
  items: {
    productId: string;
    productName: string;
    sku: string | null;
    quantity: number;
    costPrice: number;
    inventoryValue: number;
    isLowStock: boolean;
    minStockLevel: number;
  }[];
  totalValue: number;
  lowStockCount: number;
}

export interface ExpensesReport {
  total: number;
  byCategory: { categoryName: string; total: number }[];
  dailyBreakdown: { date: string; total: number }[];
  byAccount: { accountName: string; total: number }[];
}

// ─── Helpers ───────────────────────────────────────────────

async function getBranchIds(
  ctx: TenantContext,
  branchId?: string,
): Promise<string[]> {
  if (branchId) {
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch || branch.businessId !== ctx.businessId) {
      throw appError.tenantViolation("Branch does not belong to this business.");
    }
    return [branchId];
  }
  const branches = await prisma.branch.findMany({
    where: { businessId: ctx.businessId, status: "ACTIVE" },
    select: { id: true },
  });
  return branches.map((b) => b.id);
}

// ─── Reports ───────────────────────────────────────────────

/** Sales report: revenue, counts, discounts, daily breakdown, by-account. */
export async function getSalesReport(
  ctx: TenantContext,
  filters: ReportFilterInput,
): Promise<SalesReport> {
  const { from, to } = resolveReportDates(filters);
  const branchIds = await getBranchIds(ctx, filters.branchId);

  const baseWhere = {
    branchId: { in: branchIds },
    status: "COMPLETED" as const,
    deletedAt: null,
    createdAt: { gte: from, lte: to },
  };

  // Aggregate totals.
  const totals = await prisma.sale.aggregate({
    where: baseWhere,
    _sum: { finalTotal: true, discountAmount: true },
    _count: { id: true },
  });

  // Daily breakdown using groupBy.
  const dailyRaw = await prisma.sale.groupBy({
    by: ["createdAt"],
    where: baseWhere,
    _sum: { finalTotal: true },
    _count: { id: true },
    orderBy: { createdAt: "asc" },
  });

  // Collapse to date strings.
  const dailyMap = new Map<string, { revenue: number; count: number }>();
  for (const row of dailyRaw) {
    const dateStr = row.createdAt.toISOString().slice(0, 10);
    const existing = dailyMap.get(dateStr) ?? { revenue: 0, count: 0 };
    dailyMap.set(dateStr, {
      revenue: existing.revenue + (row._sum.finalTotal ?? 0),
      count: existing.count + row._count.id,
    });
  }

  // By-account breakdown.
  const paymentRaw = await prisma.payment.findMany({
    where: {
      sale: baseWhere,
    },
    include: {
      account: { select: { name: true, type: true } },
    },
  });
  const accountMap = new Map<string, { accountName: string; accountType: string; amount: number }>();
  for (const p of paymentRaw) {
    const key = p.accountId;
    const existing = accountMap.get(key) ?? {
      accountName: p.account.name,
      accountType: p.account.type,
      amount: 0,
    };
    accountMap.set(key, { ...existing, amount: existing.amount + p.amount });
  }

  return {
    totalRevenue: totals._sum.finalTotal ?? 0,
    salesCount: totals._count.id,
    totalDiscounts: totals._sum.discountAmount ?? 0,
    dailyBreakdown: Array.from(dailyMap.entries()).map(([date, v]) => ({
      date,
      ...v,
    })),
    byAccount: Array.from(accountMap.values()),
  };
}

/**
 * Profit report.
 *
 * Revenue = SUM(sale.finalTotal) for COMPLETED sales (adjusted for returns)
 * COGS    = SUM(saleItem.unitCost × saleItem.quantity) for COMPLETED sales,
 *           minus returned items' cost
 * Gross Profit = Revenue − COGS
 * Operating Expenses = SUM(expense.amount) in period
 * Net Operating Profit = Gross Profit − Operating Expenses
 *
 * NOTE: This is an operational estimate only. It does not account for
 * taxes, depreciation, or non-operating income/expenses.
 */
export async function getProfitReport(
  ctx: TenantContext,
  filters: ReportFilterInput,
): Promise<ProfitReport> {
  const { from, to } = resolveReportDates(filters);
  const branchIds = await getBranchIds(ctx, filters.branchId);

  // Revenue: completed sales in period.
  const revResult = await prisma.sale.aggregate({
    where: {
      branchId: { in: branchIds },
      status: { in: ["COMPLETED", "PARTIALLY_RETURNED"] },
      deletedAt: null,
      createdAt: { gte: from, lte: to },
    },
    _sum: { finalTotal: true },
  });
  let revenue = revResult._sum.finalTotal ?? 0;

  // Subtract refunds issued in period.
  const refundResult = await prisma.saleReturn.aggregate({
    where: {
      branchId: { in: branchIds },
      status: "COMPLETED",
      createdAt: { gte: from, lte: to },
    },
    _sum: { totalRefund: true },
  });
  revenue = Math.max(0, revenue - (refundResult._sum.totalRefund ?? 0));

  // COGS: sum of (unitCost × quantity) for sale items in completed sales in period.
  const saleItems = await prisma.saleItem.findMany({
    where: {
      sale: {
        branchId: { in: branchIds },
        status: { in: ["COMPLETED", "PARTIALLY_RETURNED"] },
        deletedAt: null,
        createdAt: { gte: from, lte: to },
      },
    },
    select: { unitCost: true, quantity: true },
  });
  let cogs = saleItems.reduce(
    (sum, item) => sum + item.unitCost * item.quantity,
    0,
  );

  // Subtract COGS for returned items (restocked only; damaged still consumed).
  const returnedItems = await prisma.saleReturnItem.findMany({
    where: {
      stockDisposition: "RESTOCK",
      saleReturn: {
        branchId: { in: branchIds },
        status: "COMPLETED",
        createdAt: { gte: from, lte: to },
      },
    },
    include: { saleItem: { select: { unitCost: true } } },
  });
  const returnedCogs = returnedItems.reduce(
    (sum, ri) => sum + ri.saleItem.unitCost * ri.quantity,
    0,
  );
  cogs = Math.max(0, cogs - returnedCogs);

  const grossProfit = revenue - cogs;

  // Operating expenses in period.
  const expResult = await prisma.expense.aggregate({
    where: {
      branchId: { in: branchIds },
      deletedAt: null,
      expenseDate: { gte: from, lte: to },
    },
    _sum: { amount: true },
  });
  const operatingExpenses = expResult._sum.amount ?? 0;
  const netOperatingProfit = grossProfit - operatingExpenses;

  return {
    revenue,
    cogs,
    grossProfit,
    operatingExpenses,
    netOperatingProfit,
    note:
      "This is a basic operational profit estimate based on recorded sales and expenses. " +
      "It does not represent a full accounting statement and should not be used for tax or legal purposes.",
  };
}

/** Inventory report: current stock, low-stock, inventory valuation. */
export async function getInventoryReport(
  ctx: TenantContext,
  branchId?: string,
): Promise<InventoryReport> {
  const targetBranchId = branchId ?? ctx.branchId;
  if (!targetBranchId) throw appError.validationError("Branch is required.");

  const branch = await prisma.branch.findUnique({
    where: { id: targetBranchId },
  });
  if (!branch || branch.businessId !== ctx.businessId) {
    throw appError.tenantViolation("Branch does not belong to this business.");
  }

  const snapshots = await prisma.stockSnapshot.findMany({
    where: { branchId: targetBranchId },
    include: { product: { select: { id: true, name: true, sku: true, costPrice: true, minStockLevel: true, status: true } } },
    orderBy: { product: { name: "asc" } },
  });

  const items = snapshots
    .filter((s) => s.product.status === "ACTIVE")
    .map((s) => ({
      productId: s.product.id,
      productName: s.product.name,
      sku: s.product.sku,
      quantity: s.quantity,
      costPrice: s.product.costPrice,
      inventoryValue: s.product.costPrice * s.quantity,
      isLowStock: s.quantity <= s.product.minStockLevel,
      minStockLevel: s.product.minStockLevel,
    }));

  return {
    items,
    totalValue: items.reduce((sum, i) => sum + i.inventoryValue, 0),
    lowStockCount: items.filter((i) => i.isLowStock).length,
  };
}

/** Expenses report: totals by category and daily breakdown. */
export async function getExpensesReport(
  ctx: TenantContext,
  filters: ReportFilterInput,
): Promise<ExpensesReport> {
  const { from, to } = resolveReportDates(filters);
  const branchIds = await getBranchIds(ctx, filters.branchId);

  const where = {
    branchId: { in: branchIds },
    deletedAt: null,
    expenseDate: { gte: from, lte: to },
  };

  const totalResult = await prisma.expense.aggregate({
    where,
    _sum: { amount: true },
  });

  // By category.
  const byCategoryRaw = await prisma.expense.groupBy({
    by: ["categoryId"],
    where,
    _sum: { amount: true },
  });
  const categoryIds = byCategoryRaw.map((r) => r.categoryId);
  const categories = await prisma.expenseCategory.findMany({
    where: { id: { in: categoryIds } },
    select: { id: true, name: true },
  });
  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const byCategory = byCategoryRaw.map((r) => ({
    categoryName: catMap.get(r.categoryId) ?? "Unknown",
    total: r._sum.amount ?? 0,
  }));

  // Daily breakdown.
  const dailyRaw = await prisma.expense.groupBy({
    by: ["expenseDate"],
    where,
    _sum: { amount: true },
    orderBy: { expenseDate: "asc" },
  });
  const dailyBreakdown = dailyRaw.map((r) => ({
    date: r.expenseDate.toISOString().slice(0, 10),
    total: r._sum.amount ?? 0,
  }));

  // By account.
  const expenses = await prisma.expense.findMany({
    where,
    include: { account: { select: { name: true } } },
  });
  const accountMap = new Map<string, { accountName: string; total: number }>();
  for (const e of expenses) {
    const existing = accountMap.get(e.accountId) ?? {
      accountName: e.account.name,
      total: 0,
    };
    accountMap.set(e.accountId, {
      ...existing,
      total: existing.total + e.amount,
    });
  }

  return {
    total: totalResult._sum.amount ?? 0,
    byCategory,
    dailyBreakdown,
    byAccount: Array.from(accountMap.values()),
  };
}
