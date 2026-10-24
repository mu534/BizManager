import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolveContext } from "@server/auth/resolve-context";
import { getProfitComparison, getProfitReport } from "@server/services/report.service";
import { canViewFinancialReports } from "@server/auth/permissions";
import { hasFeature, FEATURE_KEYS } from "@server/services/subscription.service";
import { AccessDenied } from "@components/layout/states";
import Link from "next/link";
import { prisma } from "@server/db/prisma";
import { Money } from "@shared/money";
import { reportFilterSchema } from "@shared/validation/report.schema";
import { ReportNav } from "@components/reports/report-nav";
import { RangeFilter } from "@components/reports/range-filter";
import { resolveReportBranch } from "@server/branch/report-branch";

export const metadata: Metadata = { title: "Profit Report" };


// Reads session + business-scoped DB data on every request — cannot prerender.
export const instant = false;

const COMPARISON_LABELS = {
  netSales: "Revenue",
  cogs: "Cost of goods sold",
  grossProfit: "Gross profit",
  expenses: "Operating expenses",
  operatingProfit: "Net operating profit",
} as const;

export default async function ProfitReportPage({
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
  const filters = reportFilterSchema.parse({ range: sp.range ?? "month", from: sp.from, to: sp.to, branchId: rb.selectedId });
  // Comparison with the previous period is a Pro feature.
  const comparable = await hasFeature(businessId, FEATURE_KEYS.ADVANCED_REPORTS);
  const comparison = comparable ? await getProfitComparison(ctx, filters) : null;
  const report = comparison ? comparison.current : await getProfitReport(ctx, filters);

  return (
    <div className="space-y-6">
      <ReportNav businessId={businessId} active="profit" showBranches={rb.branches.length > 1} />

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Profit Report</h1>
        <RangeFilter branches={rb.branches} branchId={rb.selectedId} range={filters.range} from={sp.from} to={sp.to} />
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        This is a management report based on recorded sales, refunds, cost snapshots and expenses. It is not a certified accounting statement and excludes taxes and other items that are not recorded in BizManager.
      </div>

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 text-sm font-semibold text-gray-700">Summary</div>
        <div className="divide-y divide-gray-100 text-sm">
          <ProfitRow label="Revenue" value={fmt(report.netSales)} />
          <ProfitRow label="Cost of Goods Sold (COGS)" value={`− ${fmt(report.cogs)}`} muted />
          <ProfitRow label="Gross Profit" value={fmt(report.grossProfit)}
            highlight={report.grossProfit >= 0 ? "positive" : "negative"} bold />
          <ProfitRow label="Operating Expenses" value={`− ${fmt(report.expenses)}`} muted />
          <ProfitRow
            label="Net Operating Profit"
            value={fmt(report.operatingProfit)}
            highlight={report.operatingProfit >= 0 ? "positive" : "negative"}
            bold
            large
          />
        </div>
      </div>


      {comparison ? (
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          <div className="border-b border-line px-5 py-4">
            <p className="text-sm font-semibold text-ink-800">Compared with the previous period</p>
            <p className="mt-0.5 text-xs text-ink-500">
              {comparison.current.period.fromKey} → {comparison.current.period.toKey} versus {comparison.previous.period.fromKey} → {comparison.previous.period.toKey} (same number of days)
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500">
                  <th className="px-5 py-2 font-medium">&nbsp;</th>
                  <th className="px-4 py-2 text-right font-medium">This period</th>
                  <th className="px-4 py-2 text-right font-medium">Previous</th>
                  <th className="px-4 py-2 text-right font-medium">Change</th>
                  <th className="px-5 py-2 text-right font-medium">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {comparison.rows.map((r) => (
                  <tr key={r.key}>
                    <td className="px-5 py-2.5 text-ink-700">{COMPARISON_LABELS[r.key]}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-900">{fmt(r.current)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-600">{fmt(r.previous)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-700">{r.change > 0 ? "+" : ""}{fmt(r.change)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-ink-700">
                      {r.changeBps === null ? "—" : `${r.changeBps > 0 ? "+" : ""}${(r.changeBps / 100).toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-5 py-3 text-xs text-ink-500">
            A dash means no percentage can be given because the previous period had none of that item. Colours are not used
            because an increase is good for profit but not for cost or expenses.
          </p>
        </div>
      ) : (
        <p className="rounded-lg border border-line bg-ink-50 px-4 py-3 text-sm text-ink-700">
          Comparing with the previous period is part of the Pro plan.{" "}
          <Link href={`/app/${businessId}/settings/subscription`} className="font-semibold text-brand-700 underline">View plans</Link>
        </p>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm space-y-2">
        <p className="font-medium text-gray-700">How these numbers are calculated</p>
        <ul className="space-y-1 text-gray-500 list-disc list-inside">
          <li>Revenue = completed sale totals minus refunds issued in this period</li>
          <li>COGS = unit cost × quantity sold (from sale item snapshots), minus restocked returns</li>
          <li>Gross Profit = Revenue − COGS</li>
          <li>Operating Expenses = all recorded expenses in this period</li>
          <li>Net Operating Profit = Gross Profit − Operating Expenses</li>
        </ul>
        <p className="text-gray-400 text-xs mt-2">
          Account balances, deposits, transfers, and inventory value are separate concepts and are not included here.
        </p>
      </div>
    </div>
  );
}

function ProfitRow({
  label,
  value,
  muted,
  highlight,
  bold,
  large,
}: {
  label: string;
  value: string;
  muted?: boolean;
  highlight?: "positive" | "negative";
  bold?: boolean;
  large?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between px-5 py-3 ${large ? "bg-gray-50" : ""}`}>
      <span className={`${muted ? "text-gray-500" : bold ? "font-semibold text-gray-900" : "text-gray-700"} ${large ? "text-base" : ""}`}>
        {label}
      </span>
      <span className={`${bold ? "font-semibold" : ""} ${large ? "text-lg" : ""} ${
        highlight === "positive" ? "text-green-700" :
        highlight === "negative" ? "text-red-600" :
        muted ? "text-gray-500" : "text-gray-900"
      }`}>
        {value}
      </span>
    </div>
  );
}

