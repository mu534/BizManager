import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolveContext } from "@server/auth/resolve-context";
import { getInventoryReport } from "@server/services/report.service";
import { prisma } from "@server/db/prisma";
import { Money } from "@shared/money";
import Link from "next/link";
import { AccessDenied } from "@components/layout/states";
import { canViewFinancialReports } from "@server/auth/permissions";
import { hasFeature, FEATURE_KEYS } from "@server/services/subscription.service";
import { ReportNav } from "@components/reports/report-nav";
import { getCurrentBranch } from "@server/branch/current-branch";

export const metadata: Metadata = { title: "Inventory Report" };


// Reads session + business-scoped DB data on every request — cannot prerender.
export const instant = false;

export default async function InventoryReportPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const ctx = await resolveContext(businessId).catch(() => null);
  if (!ctx) redirect("/sign-in");
  if (!canViewFinancialReports(ctx)) return <AccessDenied businessId={businessId} what="financial reports" />;
  // Valuation (cost and value) is a Pro feature; stock levels and low stock are for every plan.
  const valuation = await hasFeature(businessId, FEATURE_KEYS.ADVANCED_REPORTS);

  const branch = await getCurrentBranch(ctx);
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { currency: true } });
  const currency = business?.currency ?? "ETB";
  const fmt = (n: number) => Money.format(n, currency);

  const report = await getInventoryReport(ctx, branch?.id, { includeValuation: valuation });

  return (
    <div className="space-y-6">
      <ReportNav businessId={businessId} active="inventory" />
      <h1 className="text-xl font-semibold text-gray-900">Inventory Report</h1>

      {!valuation && (
        <p className="rounded-lg border border-line bg-ink-50 px-4 py-3 text-sm text-ink-700">
          Inventory valuation (cost and total value) is part of the Pro plan.{" "}
          <Link href={`/app/${businessId}/settings/subscription`} className="font-semibold text-brand-700 underline">View plans</Link>
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {valuation && (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
          <p className="text-xs text-gray-500">Total Inventory Value</p>
          <p className="mt-1 text-xl font-semibold text-gray-900">{fmt(report.totalValue)}</p>
          <p className="text-xs text-gray-400 mt-0.5">At cost price</p>
        </div>
        )}
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
          <p className="text-xs text-gray-500">Total Products</p>
          <p className="mt-1 text-xl font-semibold text-gray-900">{report.items.length}</p>
        </div>
        <div className={`rounded-lg border px-4 py-3 ${report.lowStockCount > 0 ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-white"}`}>
          <p className="text-xs text-gray-500">Low Stock</p>
          <p className={`mt-1 text-xl font-semibold ${report.lowStockCount > 0 ? "text-amber-700" : "text-gray-900"}`}>
            {report.lowStockCount}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-700">
          Stock Levels — {branch?.name ?? "All Branches"}
        </div>
        {report.items.length === 0 ? (
          <p className="px-4 py-8 text-sm text-gray-400 text-center">No inventory data.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-gray-600">Product</th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-600">In Stock</th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-600 hidden sm:table-cell">Min Level</th>
                {valuation && <th className="px-4 py-2.5 text-right font-medium text-gray-600 hidden md:table-cell">Cost / Unit</th>}
                {valuation && <th className="px-4 py-2.5 text-right font-medium text-gray-600">Value</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {report.items.map((item) => (
                <tr key={item.productId} className={`hover:bg-gray-50 ${item.isLowStock ? "bg-amber-50/30" : ""}`}>
                  <td className="px-4 py-2.5 text-gray-900">
                    {item.productName}
                    {item.sku && <span className="ml-2 text-xs text-gray-400">{item.sku}</span>}
                    {item.isLowStock && <span className="ml-2 text-xs text-amber-600 font-medium">LOW</span>}
                  </td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${item.isLowStock ? "text-amber-700" : "text-gray-900"}`}>
                    {item.quantity}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-500 hidden sm:table-cell">{item.minStockLevel}</td>
                  {valuation && <td className="px-4 py-2.5 text-right text-gray-600 hidden md:table-cell">{fmt(item.costPrice)}</td>}
                  {valuation && <td className="px-4 py-2.5 text-right text-gray-900 font-medium">{fmt(item.inventoryValue)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

