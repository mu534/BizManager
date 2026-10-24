/**
 * Dashboard service — SERVER ONLY.
 *
 * Everything on the dashboard is computed here from real records using the
 * same period rules as the reports (computePeriodFinancials). Financial
 * fields (profit, expenses, account balances, stock valuation) are returned
 * only to OWNER/MANAGER; STAFF receive sales activity and stock alerts.
 */
import "server-only";
import { prisma } from "@server/db/prisma";
import { listAccessibleBranches } from "@server/services/branch-access.service";
import { hasFeature, FEATURE_KEYS } from "@server/services/subscription.service";
import { pickCurrentBranch } from "@shared/branch-rules";
import { appError } from "@shared/errors";
import { canViewFinancialReports } from "@server/auth/permissions";
import { getBusinessTime } from "@server/services/business-time";
import { computePeriodFinancials, getInventoryReport } from "@server/services/report.service";
import type { DailyPoint, ProfitResult } from "@shared/profit";
import { resolvePeriod, type ReportRange } from "@shared/time";
import type { TenantContext } from "@shared/types/auth.types";

export interface DashboardData {
  business: { name: string; currency: string };
  branch: { id: string; name: string };
  period: { range: ReportRange; fromKey: string; toKey: string };
  canSeeFinancials: boolean;
  sales: { gross: number; refunds: number; net: number; count: number; averageSale: number; returnsCount: number };
  /** Present only for OWNER/MANAGER. */
  profit: ProfitResult | null;
  accounts: { id: string; name: string; type: string; balance: number }[] | null;
  inventory: {
    activeProducts: number;
    lowStockCount: number;
    outOfStockCount: number;
    lowStock: { productId: string; name: string; quantity: number; minStockLevel: number }[];
    value: number | null;
  };
  /** Daily net sales; covers the last 7 days when the selected period is a single day. */
  trend: DailyPoint[];
  trendDays: number;
  recentSales: {
    id: string;
    receiptNumber: string | null;
    createdAt: Date;
    finalTotal: number;
    status: string;
    itemCount: number;
    accountName: string | null;
    soldBy: string;
  }[];
}

export async function getDashboard(
  ctx: TenantContext,
  range: ReportRange,
  /** The member's chosen branch (a preference — re-validated against their access here). */
  preferredBranchId?: string | null,
): Promise<DashboardData> {
  const branch = pickCurrentBranch(await listAccessibleBranches(ctx), preferredBranchId);
  if (!branch) throw appError.notFound("No active branch is available to you.");

  const [business, biz] = await Promise.all([
    prisma.business.findUnique({ where: { id: ctx.businessId }, select: { name: true } }),
    getBusinessTime(ctx.businessId),
  ]);
  if (!business) throw appError.notFound("Business not found.");

  const canSeeFinancials = canViewFinancialReports(ctx);
  // Inventory valuation is a Pro feature: ask for it only when the plan includes
  // it, otherwise the report would refuse and the whole dashboard would fail.
  const showValuation =
    canSeeFinancials && (await hasFeature(ctx.businessId, FEATURE_KEYS.ADVANCED_REPORTS));
  const period = resolvePeriod({ range }, biz.offsetMinutes);
  const branchIds = [branch.id];

  // A one-day period cannot show a trend, so the chart uses the last 7 days.
  const trendPeriod = range === "today" ? resolvePeriod({ range: "7days" }, biz.offsetMinutes) : period;

  const [fin, trendFin, inventory, accounts, recent] = await Promise.all([
    computePeriodFinancials(branchIds, period, biz.offsetMinutes, { withCost: canSeeFinancials }),
    range === "today"
      ? computePeriodFinancials(branchIds, trendPeriod, biz.offsetMinutes, { withCost: false })
      : Promise.resolve(null),
    getInventoryReport(ctx, branch.id, { includeValuation: showValuation }),
    canSeeFinancials
      ? prisma.financialAccount.findMany({
          where: { businessId: ctx.businessId, status: "ACTIVE" },
          select: { id: true, name: true, type: true, currentBalance: true },
          orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        })
      : Promise.resolve(null),
    prisma.sale.findMany({
      where: { branchId: branch.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        receiptNumber: true,
        createdAt: true,
        finalTotal: true,
        status: true,
        createdBy: { select: { name: true } },
        payments: { select: { account: { select: { name: true } } }, take: 1 },
        _count: { select: { items: true } },
      },
    }),
  ]);

  const { salesCount, returnsCount, daily: _daily, discounts: _discounts, ...profit } = fin;
  const trend = (trendFin ?? fin).daily;

  return {
    business: { name: business.name, currency: biz.currency },
    branch: { id: branch.id, name: branch.name },
    period: { range, fromKey: period.fromKey, toKey: period.toKey },
    canSeeFinancials,
    sales: {
      gross: fin.sales,
      refunds: fin.refunds,
      net: fin.netSales,
      count: salesCount,
      averageSale: salesCount > 0 ? Math.round(fin.sales / salesCount) : 0,
      returnsCount,
    },
    profit: canSeeFinancials ? profit : null,
    accounts: accounts
      ? accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, balance: a.currentBalance }))
      : null,
    inventory: {
      activeProducts: inventory.items.length,
      lowStockCount: inventory.lowStockCount,
      outOfStockCount: inventory.outOfStockCount,
      lowStock: inventory.items
        .filter((i) => i.isLowStock)
        .sort((a, b) => a.quantity - b.quantity)
        .slice(0, 6)
        .map((i) => ({ productId: i.productId, name: i.productName, quantity: i.quantity, minStockLevel: i.minStockLevel })),
      value: showValuation ? inventory.totalValue : null,
    },
    trend,
    trendDays: trend.length,
    recentSales: recent.map((s) => ({
      id: s.id,
      receiptNumber: s.receiptNumber,
      createdAt: s.createdAt,
      finalTotal: s.finalTotal,
      status: s.status,
      itemCount: s._count.items,
      accountName: s.payments[0]?.account.name ?? null,
      soldBy: s.createdBy.name,
    })),
  };
}
