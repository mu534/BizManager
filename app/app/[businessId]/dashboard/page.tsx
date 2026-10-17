import Link from "next/link";
import { resolveContext } from "@server/auth/resolve-context";
import { getDashboard } from "@server/services/dashboard.service";
import { ButtonLink } from "@components/ui/button";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Stat } from "@components/ui/primitives";
import { IconBox, IconCart, IconPlus, IconReceipt } from "@components/ui/icons";
import { formatDate, formatMoney, formatTime } from "@components/ui/format";
import { SaleStatusBadge } from "@components/domain/status";
import { TrendChart } from "@components/charts/trend-chart";
import { Money } from "@shared/money";
import type { ReportRange } from "@shared/time";

const RANGES: { value: ReportRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7days", label: "Last 7 days" },
  { value: "month", label: "This month" },
];

function periodLabel(range: ReportRange, from: string, to: string): string {
  if (range === "today") return `Today, ${formatDate(`${to}T12:00:00Z`)}`;
  return `${formatDate(`${from}T12:00:00Z`)} – ${formatDate(`${to}T12:00:00Z`)}`;
}

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const [{ businessId }, sp] = await Promise.all([params, searchParams]);
  const range: ReportRange = sp.range === "7days" || sp.range === "month" ? sp.range : "today";
  const ctx = await resolveContext(businessId);
  const d = await getDashboard(ctx, range);
  const cur = d.business.currency;
  const money = (n: number) => formatMoney(n, cur);
  const base = `/app/${businessId}`;
  const isEmptyBusiness = d.inventory.activeProducts === 0;
  const cashTotal = d.accounts?.reduce((s, a) => s + a.balance, 0) ?? 0;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${d.branch.name} · ${periodLabel(range, d.period.fromKey, d.period.toKey)}`}
        actions={
          <>
            {ctx.role !== "STAFF" && (
              <ButtonLink href={`${base}/products/new`} variant="secondary"><IconPlus size={16} />Add product</ButtonLink>
            )}
            <ButtonLink href={`${base}/sell`}><IconCart size={16} />Start a sale</ButtonLink>
          </>
        }
      />

      <div role="tablist" aria-label="Period" className="mb-5 inline-flex rounded-control border border-line bg-surface p-0.5">
        {RANGES.map((r) => (
          <Link
            key={r.value} role="tab" aria-selected={range === r.value}
            href={`${base}/dashboard${r.value === "today" ? "" : `?range=${r.value}`}`}
            className={`rounded px-3.5 py-1.5 text-[13px] font-medium ${range === r.value ? "bg-ink-900 text-white" : "text-ink-600 hover:text-ink-900"}`}
          >
            {r.label}
          </Link>
        ))}
      </div>

      {isEmptyBusiness && (
        <Card className="mb-5 overflow-hidden">
          <div className="bg-brand-gradient bg-grid-light p-5 text-white">
            <h2 className="text-lg font-semibold">Set up your shop in three steps</h2>
            <p className="mt-1 max-w-xl text-sm text-white/85">Your dashboard fills in as soon as you record real sales. Nothing here is sample data.</p>
          </div>
          <ol className="grid gap-px bg-line sm:grid-cols-3">
            {[
              { n: 1, t: "Add your products", h: `${base}/products/new`, d: "Name, price and cost for each item." },
              { n: 2, t: "Record opening stock", h: `${base}/inventory/adjust`, d: "Tell BizManager what is on your shelves." },
              { n: 3, t: "Make your first sale", h: `${base}/sell`, d: "Works offline and syncs later." },
            ].map((s) => (
              <li key={s.n} className="bg-surface p-4">
                <Link href={s.h} className="group block">
                  <span className="text-xs font-semibold text-brand-700">Step {s.n}</span>
                  <p className="mt-0.5 font-semibold text-ink-900 group-hover:underline">{s.t}</p>
                  <p className="mt-0.5 text-[13px] text-ink-500">{s.d}</p>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Net sales" value={money(d.sales.net)} emphasis
          sub={d.sales.refunds > 0 ? `${money(d.sales.gross)} sold − ${money(d.sales.refunds)} refunded` : `${d.sales.count} sale${d.sales.count === 1 ? "" : "s"}`} />
        {d.profit ? (
          <>
            <Stat label="Operating profit" value={money(d.profit.operatingProfit)} tone={d.profit.operatingProfit < 0 ? "negative" : "positive"}
              sub={`Gross ${money(d.profit.grossProfit)} − expenses`} />
            <Stat label="Expenses" value={money(d.profit.expenses)} sub="Recorded in this period" />
            <Stat label="Cash & accounts" value={money(cashTotal)} sub={`${d.accounts?.length ?? 0} active accounts`} />
          </>
        ) : (
          <>
            <Stat label="Transactions" value={String(d.sales.count)} sub="Sales in this period" />
            <Stat label="Average sale" value={money(d.sales.averageSale)} />
            <Stat label="Low stock" value={String(d.inventory.lowStockCount)} tone={d.inventory.lowStockCount > 0 ? "negative" : "neutral"} sub={`${d.inventory.outOfStockCount} out of stock`} />
          </>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Sales trend" description={`Net sales per day · last ${d.trendDays} day${d.trendDays === 1 ? "" : "s"}`} />
            <div className="p-4">
              <TrendChart points={d.trend} format={money} compact={(n) => Money.toMajorUnits(n, cur) >= 1000 ? `${Math.round(Money.toMajorUnits(n, cur) / 100) / 10}k` : String(Math.round(Money.toMajorUnits(n, cur)))} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Recent sales" action={<Link href={`${base}/sell/history`} className="text-[13px] font-medium text-brand-700 hover:underline">View all</Link>} />
            {d.recentSales.length === 0 ? (
              <EmptyState icon={<IconReceipt size={22} />} title="No sales yet" description="Completed sales appear here with their receipt number and status."
                action={<ButtonLink href={`${base}/sell`} size="sm">Start a sale</ButtonLink>} />
            ) : (
              <ul className="divide-y divide-line">
                {d.recentSales.map((s) => (
                  <li key={s.id}>
                    <Link href={`${base}/sell/history/${s.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-ink-50 sm:px-5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink-900">{s.receiptNumber ?? "Sale"}</p>
                        <p className="truncate text-xs text-ink-500">{formatDate(s.createdAt)}, {formatTime(s.createdAt)} · {s.itemCount} item{s.itemCount === 1 ? "" : "s"}{s.accountName ? ` · ${s.accountName}` : ""} · {s.soldBy}</p>
                      </div>
                      <SaleStatusBadge status={s.status} />
                      <p className="w-28 text-right text-sm font-semibold tabular-nums text-ink-900">{money(s.finalTotal)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Stock alerts" description={d.inventory.lowStockCount === 0 ? "Nothing needs restocking" : `${d.inventory.lowStockCount} item${d.inventory.lowStockCount === 1 ? "" : "s"} at or below minimum`} />
            {d.inventory.lowStock.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-ink-500">All active products are above their minimum level.</p>
            ) : (
              <ul className="divide-y divide-line">
                {d.inventory.lowStock.map((p) => (
                  <li key={p.productId}>
                    <Link href={`${base}/inventory/${p.productId}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-ink-50 sm:px-5">
                      <span className="min-w-0 truncate text-sm text-ink-800">{p.name}</span>
                      <Badge tone={p.quantity <= 0 ? "danger" : "warning"}>{p.quantity <= 0 ? "Out" : `${p.quantity} left`}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {ctx.role !== "STAFF" && d.inventory.lowStock.length > 0 && (
              <div className="border-t border-line p-3"><ButtonLink href={`${base}/inventory/adjust`} variant="secondary" size="sm" className="w-full"><IconBox size={15} />Record stock received</ButtonLink></div>
            )}
          </Card>

          {d.accounts && (
            <Card>
              <CardHeader title="Accounts" action={<Link href={`${base}/accounts`} className="text-[13px] font-medium text-brand-700 hover:underline">Manage</Link>} />
              <ul className="divide-y divide-line">
                {d.accounts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                    <span className="text-sm text-ink-800">{a.name}</span>
                    <span className="text-sm font-semibold tabular-nums text-ink-900">{money(a.balance)}</span>
                  </li>
                ))}
              </ul>
              {d.inventory.value !== null && (
                <p className="border-t border-line px-5 py-3 text-xs text-ink-500">Stock on hand is valued at {money(d.inventory.value)} at cost — not included in cash.</p>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
