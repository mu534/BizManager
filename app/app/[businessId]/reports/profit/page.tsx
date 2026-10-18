import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { resolveContext } from "@server/auth/resolve-context";
import { getProfitReport } from "@server/services/report.service";
import { prisma } from "@server/db/prisma";
import { Money } from "@shared/money";
import { reportFilterSchema } from "@shared/validation/report.schema";

export const metadata: Metadata = { title: "Profit Report" };


// Reads session + business-scoped DB data on every request — cannot prerender.
export const instant = false;

export default async function ProfitReportPage({
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
  const report = await getProfitReport(ctx, filters);

  return (
    <div className="space-y-6">
      <ReportNav businessId={businessId} active="profit" />

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Profit Report</h1>
        <RangeFilter range={filters.range} from={sp.from} to={sp.to} />
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        {report.note}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 text-sm font-semibold text-gray-700">Summary</div>
        <div className="divide-y divide-gray-100 text-sm">
          <ProfitRow label="Revenue" value={fmt(report.revenue)} />
          <ProfitRow label="Cost of Goods Sold (COGS)" value={`− ${fmt(report.cogs)}`} muted />
          <ProfitRow label="Gross Profit" value={fmt(report.grossProfit)}
            highlight={report.grossProfit >= 0 ? "positive" : "negative"} bold />
          <ProfitRow label="Operating Expenses" value={`− ${fmt(report.operatingExpenses)}`} muted />
          <ProfitRow
            label="Net Operating Profit"
            value={fmt(report.netOperatingProfit)}
            highlight={report.netOperatingProfit >= 0 ? "positive" : "negative"}
            bold
            large
          />
        </div>
      </div>

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
