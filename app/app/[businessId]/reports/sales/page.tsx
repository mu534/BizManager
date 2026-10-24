import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolveContext } from "@server/auth/resolve-context";
import { getSalesReport } from "@server/services/report.service";
import { prisma } from "@server/db/prisma";
import { Money } from "@shared/money";
import { reportFilterSchema } from "@shared/validation/report.schema";
import { ReportNav } from "@components/reports/report-nav";
import { RangeFilter } from "@components/reports/range-filter";
import { canViewFinancialReports } from "@server/auth/permissions";
import { AccessDenied } from "@components/layout/states";
import { resolveReportBranch } from "@server/branch/report-branch";

export const metadata: Metadata = { title: "Sales Report" };


// Reads session + business-scoped DB data on every request — cannot prerender.
export const instant = false;

export default async function SalesReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ branch?: string; range?: string; from?: string; to?: string }>;
}) {
  const { businessId } = await params;
  const sp = await searchParams;
  const ctx = await resolveContext(businessId).catch(() => null);
  if (!ctx) redirect("/sign-in");
  if (!canViewFinancialReports(ctx)) return <AccessDenied businessId={businessId} what="financial reports" />;

  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { currency: true } });
  const currency = business?.currency ?? "ETB";
  const fmt = (n: number) => Money.format(n, currency);

  const rb = await resolveReportBranch(ctx, sp.branch);
  const filters = reportFilterSchema.parse({ range: sp.range ?? "today", from: sp.from, to: sp.to, branchId: rb.selectedId });
  const report = await getSalesReport(ctx, filters);

  return (
    <div className="space-y-6">
      <ReportNav businessId={businessId} active="sales" showBranches={rb.branches.length > 1} />

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Sales Report</h1>
        <RangeFilter branches={rb.branches} branchId={rb.selectedId} range={filters.range} from={filters.range === "custom" ? sp.from : undefined} to={filters.range === "custom" ? sp.to : undefined} />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Total Revenue" value={fmt(report.totals.netSales)} />
        <Stat label="Sales Count" value={String(report.totals.salesCount)} />
        <Stat label="Total Discounts" value={fmt(report.totals.discounts)} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Daily breakdown */}
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-700">Sales by Day</div>
          {report.daily.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-400">No sales in this period.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Date</th>
                  <th className="px-4 py-2 text-center font-medium text-gray-500">Sales</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-500">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {report.daily.map((d) => (
                  <tr key={d.date} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-600">{d.date}</td>
                    <td className="px-4 py-2 text-center text-gray-600">{d.count}</td>
                    <td className="px-4 py-2 text-right font-medium text-gray-900">{fmt(d.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* By account */}
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-700">By Payment Account</div>
          {report.byAccount.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-400">No payment data.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Account</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-500">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {report.byAccount.map((a, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-900">{a.accountName}</td>
                    <td className="px-4 py-2 text-right font-medium text-gray-900">{fmt(a.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}

