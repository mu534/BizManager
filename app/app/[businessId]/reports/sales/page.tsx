import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { resolveContext } from "@server/auth/resolve-context";
import { getSalesReport } from "@server/services/report.service";
import { prisma } from "@server/db/prisma";
import { Money } from "@shared/money";
import { reportFilterSchema } from "@shared/validation/report.schema";

export const metadata: Metadata = { title: "Sales Report" };


// Reads session + business-scoped DB data on every request — cannot prerender.
export const instant = false;

export default async function SalesReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { businessId } = await params;
  const sp = await searchParams;
  const ctx = await resolveContext(businessId).catch(() => null);
  if (!ctx) redirect("/sign-in");

  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { currency: true } });
  const currency = business?.currency ?? "ETB";
  const fmt = (n: number) => Money.format(n, currency);

  const filters = reportFilterSchema.parse({ range: sp.range ?? "today", from: sp.from, to: sp.to });
  const report = await getSalesReport(ctx, filters);

  return (
    <div className="space-y-6">
      <ReportNav businessId={businessId} active="sales" />

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Sales Report</h1>
        <RangeFilter range={filters.range} from={filters.range === "custom" ? sp.from : undefined} to={filters.range === "custom" ? sp.to : undefined} />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Total Revenue" value={fmt(report.totalRevenue)} />
        <Stat label="Sales Count" value={String(report.salesCount)} />
        <Stat label="Total Discounts" value={fmt(report.totalDiscounts)} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Daily breakdown */}
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-700">Sales by Day</div>
          {report.dailyBreakdown.length === 0 ? (
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
                {report.dailyBreakdown.map((d) => (
                  <tr key={d.date} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-600">{d.date}</td>
                    <td className="px-4 py-2 text-center text-gray-600">{d.count}</td>
                    <td className="px-4 py-2 text-right font-medium text-gray-900">{fmt(d.revenue)}</td>
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
                    <td className="px-4 py-2 text-right font-medium text-gray-900">{fmt(a.amount)}</td>
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

function ReportNav({ businessId, active }: { businessId: string; active: string }) {
  const links = [
    { href: `sales`, label: "Sales" },
    { href: `profit`, label: "Profit" },
    { href: `inventory`, label: "Inventory" },
    { href: `expenses`, label: "Expenses" },
  ];
  return (
    <div className="flex gap-2 overflow-x-auto">
      {links.map((l) => (
        <Link key={l.href} href={`/app/${businessId}/reports/${l.href}`}
          className={`rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap ${active === l.href ? "bg-blue-600 text-white" : "border border-gray-300 text-gray-700 hover:bg-gray-50"}`}>
          {l.label}
        </Link>
      ))}
    </div>
  );
}

function RangeFilter({ range, from, to }: { range: string; from?: string; to?: string }) {
  return (
    <form method="GET" className="flex flex-wrap gap-2 items-center">
      {(["today", "7days", "month", "custom"] as const).map((r) => (
        <button key={r} name="range" value={r} type="submit"
          className={`rounded px-2.5 py-1 text-xs font-medium ${range === r ? "bg-gray-900 text-white" : "border border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
          {r === "today" ? "Today" : r === "7days" ? "7 Days" : r === "month" ? "This Month" : "Custom"}
        </button>
      ))}
      {range === "custom" && (
        <>
          <input name="from" type="date" defaultValue={from}
            className="rounded border border-gray-300 px-2 py-1 text-xs" />
          <input name="to" type="date" defaultValue={to}
            className="rounded border border-gray-300 px-2 py-1 text-xs" />
          <button type="submit" className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700">Go</button>
        </>
      )}
    </form>
  );
}
