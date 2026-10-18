import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { resolveContext } from "@server/auth/resolve-context";
import { getExpensesReport } from "@server/services/report.service";
import { prisma } from "@server/db/prisma";
import { Money } from "@shared/money";
import { reportFilterSchema } from "@shared/validation/report.schema";

export const metadata: Metadata = { title: "Expenses Report" };


// Reads session + business-scoped DB data on every request — cannot prerender.
export const instant = false;

export default async function ExpensesReportPage({
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

  const filters = reportFilterSchema.parse({ range: sp.range ?? "month", from: sp.from, to: sp.to });
  const report = await getExpensesReport(ctx, filters);

  return (
    <div className="space-y-6">
      <ReportNav businessId={businessId} active="expenses" />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Expenses Report</h1>
        <RangeFilter range={filters.range} from={sp.from} to={sp.to} />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
        <p className="text-xs text-gray-500">Total Expenses</p>
        <p className="mt-1 text-2xl font-bold text-gray-900">{fmt(report.total)}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* By category */}
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-700">By Category</div>
          {report.byCategory.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-400">No expenses.</p>
          ) : (
            <table className="min-w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {report.byCategory
                  .sort((a, b) => b.total - a.total)
                  .map((c, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-900">{c.categoryName}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-gray-900">{fmt(c.total)}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-gray-400">
                        {report.total > 0 ? `${Math.round((c.total / report.total) * 100)}%` : "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>

        {/* By account */}
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-700">By Account</div>
          {report.byAccount.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-400">No data.</p>
          ) : (
            <table className="min-w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {report.byAccount.map((a, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-900">{a.accountName}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-900">{fmt(a.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Daily trend */}
      {report.dailyBreakdown.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-700">Daily Trend</div>
          <table className="min-w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {report.dailyBreakdown.map((d) => (
                <tr key={d.date} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-600">{d.date}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-gray-900">{fmt(d.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ReportNav({ businessId, active }: { businessId: string; active: string }) {
  const links = [
    { href: "sales", label: "Sales" },
    { href: "profit", label: "Profit" },
    { href: "inventory", label: "Inventory" },
    { href: "expenses", label: "Expenses" },
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
          <input name="from" type="date" defaultValue={from} className="rounded border border-gray-300 px-2 py-1 text-xs" />
          <input name="to" type="date" defaultValue={to} className="rounded border border-gray-300 px-2 py-1 text-xs" />
          <button type="submit" className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700">Go</button>
        </>
      )}
    </form>
  );
}
