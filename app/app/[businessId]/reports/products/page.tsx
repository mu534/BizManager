import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveContext } from "@server/auth/resolve-context";
import { getProductPerformanceReport } from "@server/services/product-report.service";
import { prisma } from "@server/db/prisma";
import { AccessDenied } from "@components/layout/states";
import { ReportNav } from "@components/reports/report-nav";
import { RangeFilter } from "@components/reports/range-filter";
import { Alert, Card, CardHeader, EmptyState, PageHeader, Stat, Table, TableWrap, Td, Th } from "@components/ui/primitives";
import { ButtonLink } from "@components/ui/button";
import { formatMoney } from "@components/ui/format";
import { canViewFinancialReports } from "@server/auth/permissions";
import { isAppError } from "@shared/errors";
import { reportFilterSchema } from "@shared/validation/report.schema";
import type { SortKey } from "@shared/product-performance";
import { resolveReportBranch } from "@server/branch/report-branch";

export const metadata: Metadata = { title: "Product profitability" };
// Reads session + business-scoped DB data on every request — cannot prerender.
export const instant = false;

const SORTS: { key: SortKey; label: string }[] = [
  { key: "profit", label: "Most profitable" },
  { key: "units", label: "Best selling" },
  { key: "revenue", label: "Highest revenue" },
];

function pct(bps: number | null): string {
  if (bps === null) return "—";
  return `${(bps / 100).toFixed(1)}%`;
}

export default async function ProductReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ branch?: string; range?: string; from?: string; to?: string; sort?: string }>;
}) {
  const { businessId } = await params;
  const sp = await searchParams;
  const ctx = await resolveContext(businessId).catch(() => null);
  if (!ctx) redirect("/sign-in");
  if (!canViewFinancialReports(ctx)) return <AccessDenied businessId={businessId} what="financial reports" />;

  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { currency: true } });
  const currency = business?.currency ?? "ETB";
  const fmt = (n: number) => formatMoney(n, currency);

  const rb = await resolveReportBranch(ctx, sp.branch);
  const filters = reportFilterSchema.parse({ range: sp.range ?? "month", from: sp.from, to: sp.to, branchId: rb.selectedId });
  const sort: SortKey = SORTS.some((s) => s.key === sp.sort) ? (sp.sort as SortKey) : "profit";

  let report: Awaited<ReturnType<typeof getProductPerformanceReport>> | null = null;
  let blocked: string | null = null;
  try {
    report = await getProductPerformanceReport(ctx, filters, sort);
  } catch (err) {
    if (isAppError(err) && (err.code === "SUBSCRIPTION_LIMIT" || err.code === "VALIDATION_ERROR")) blocked = err.message;
    else throw err;
  }

  const keep = { sort };
  const exportQuery = new URLSearchParams({ ...(rb.selectedId ? { branch: rb.selectedId } : {}), range: filters.range, ...(filters.from ? { from: filters.from } : {}), ...(filters.to ? { to: filters.to } : {}), sort });

  return (
    <div className="space-y-6">
      <ReportNav businessId={businessId} active="products" showBranches={rb.branches.length > 1} />
      <PageHeader
        title="Product profitability"
        description="Which products sell most and which earn the most. Cost comes from what each sale actually cost at the time."
        actions={
          report && report.rows.length > 0 ? (
            <ButtonLink href={`/api/${businessId}/reports/products/export?${exportQuery.toString()}`} variant="secondary" prefetch={false}>
              Export CSV
            </ButtonLink>
          ) : null
        }
      />
      <RangeFilter branches={rb.branches} branchId={rb.selectedId} range={filters.range} from={sp.from} to={sp.to} keep={keep} />

      {blocked && (
        <Alert tone="warning" title="Not available on your plan">
          {blocked}{" "}
          <Link href={`/app/${businessId}/settings/subscription`} className="font-semibold underline">View plans</Link>
        </Alert>
      )}

      {report && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Revenue" value={fmt(report.totals.revenue)} sub="Net of discounts and refunds" />
            <Stat label="Cost of goods sold" value={fmt(report.totals.cogs)} />
            <Stat label="Gross profit" value={fmt(report.totals.profit)} />
            <Stat label="Units sold (net)" value={report.totals.unitsSold} />
          </div>

          <Card>
            <CardHeader
              title="Products"
              description="Gross profit = revenue − cost of goods sold. Operating expenses are not attributed to products."
              action={
                <nav aria-label="Sort products" className="flex gap-1">
                  {SORTS.map((s) => (
                    <Link
                      key={s.key}
                      href={`?${new URLSearchParams({ ...(rb.selectedId ? { branch: rb.selectedId } : {}), range: filters.range, ...(sp.from ? { from: sp.from } : {}), ...(sp.to ? { to: sp.to } : {}), sort: s.key }).toString()}`}
                      aria-current={sort === s.key ? "true" : undefined}
                      className={`rounded-control px-2.5 py-1 text-[13px] font-medium ${sort === s.key ? "bg-brand-50 text-brand-800" : "text-ink-600 hover:bg-ink-100"}`}
                    >
                      {s.label}
                    </Link>
                  ))}
                </nav>
              }
            />
            {report.rows.length === 0 ? (
              <EmptyState title="No sales in this period" description="Record sales or choose a wider date range to see product results." />
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>#</Th><Th>Product</Th><Th align="right">Units</Th><Th align="right">Revenue</Th>
                      <Th align="right">Cost</Th><Th align="right">Profit</Th><Th align="right">Margin</Th><Th align="right">Share of profit</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((r, i) => (
                      <tr key={r.productId}>
                        <Td>{i + 1}</Td>
                        <Td>
                          <span className="font-medium text-ink-900">{r.productName}</span>
                          {r.productSku && <span className="block text-xs text-ink-500">{r.productSku}</span>}
                        </Td>
                        <Td align="right">{r.unitsSold}</Td>
                        <Td align="right">{fmt(r.revenue)}</Td>
                        <Td align="right">{fmt(r.cogs)}</Td>
                        <Td align="right"><span className={r.profit < 0 ? "text-danger-600" : "font-medium text-ink-900"}>{fmt(r.profit)}</span></Td>
                        <Td align="right">{pct(r.marginBps)}</Td>
                        <Td align="right">{pct(r.profitShareBps)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </Card>
          <p className="text-xs text-ink-500">
            Management report from recorded sales, refunds and cost snapshots — not a certified accounting statement. A dash means a
            margin or share cannot be calculated (for example, zero revenue).
          </p>
        </>
      )}
    </div>
  );
}
