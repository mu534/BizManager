import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveContext } from "@server/auth/resolve-context";
import { canViewFinancialReports } from "@server/auth/permissions";
import { getBranchComparisonReport } from "@server/services/report.service";
import { prisma } from "@server/db/prisma";
import { AccessDenied } from "@components/layout/states";
import { ReportNav } from "@components/reports/report-nav";
import { RangeFilter } from "@components/reports/range-filter";
import { Alert, Badge, Card, CardHeader, EmptyState, PageHeader, Stat, Table, TableWrap, Td, Th } from "@components/ui/primitives";
import { formatMoney } from "@components/ui/format";
import { isAppError } from "@shared/errors";
import { reportFilterSchema } from "@shared/validation/report.schema";

export const metadata: Metadata = { title: "Branch comparison" };
// Reads session + business-scoped DB data on every request — cannot prerender.
export const instant = false;

const pct = (bps: number | null) => (bps === null ? "—" : `${(bps / 100).toFixed(1)}%`);

export default async function BranchReportPage({
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
  if (!canViewFinancialReports(ctx)) return <AccessDenied businessId={businessId} what="financial reports" />;

  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { currency: true } });
  const fmt = (n: number) => formatMoney(n, business?.currency ?? "ETB");
  const filters = reportFilterSchema.parse({ range: sp.range ?? "month", from: sp.from, to: sp.to });

  let report: Awaited<ReturnType<typeof getBranchComparisonReport>> | null = null;
  let blocked: string | null = null;
  try {
    report = await getBranchComparisonReport(ctx, filters);
  } catch (err) {
    if (isAppError(err) && err.code === "SUBSCRIPTION_LIMIT") blocked = err.message;
    else throw err;
  }

  return (
    <div className="space-y-6">
      <ReportNav businessId={businessId} active="branches" showBranches />
      <PageHeader
        title="Branch comparison"
        description="How each branch performed over the same period, and the combined total for the branches you can see."
      />
      <RangeFilter range={filters.range} from={sp.from} to={sp.to} />

      {blocked && (
        <Alert tone="warning" title="Branches are part of the Business plan">
          {blocked}{" "}
          <Link href={`/app/${businessId}/settings/subscription`} className="font-semibold underline">View plans</Link>
        </Alert>
      )}

      {report && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Revenue (all branches)" value={fmt(report.totals.netSales)} sub="Net of discounts and refunds" />
            <Stat label="Gross profit" value={fmt(report.totals.grossProfit)} />
            <Stat label="Operating expenses" value={fmt(report.totals.expenses)} />
            <Stat label="Net operating profit" value={fmt(report.totals.operatingProfit)} />
          </div>

          <Card>
            <CardHeader title="By branch" description={`${report.period.fromKey} → ${report.period.toKey}, ranked by revenue.`} />
            {report.rows.length === 0 ? (
              <EmptyState title="No branches to show" description="Branches you can use will appear here." />
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>Branch</Th><Th align="right">Sales</Th><Th align="right">Revenue</Th><Th align="right">Cost</Th>
                      <Th align="right">Gross profit</Th><Th align="right">Expenses</Th><Th align="right">Operating profit</Th>
                      <Th align="right">Margin</Th><Th align="right">Share of revenue</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((r) => (
                      <tr key={r.branchId}>
                        <Td>
                          <span className="font-medium text-ink-900">{r.branchName}</span>
                          {r.closed && <Badge tone="danger" className="ml-2">Closed</Badge>}
                        </Td>
                        <Td align="right">{r.salesCount}</Td>
                        <Td align="right">{fmt(r.netSales)}</Td>
                        <Td align="right">{fmt(r.cogs)}</Td>
                        <Td align="right">{fmt(r.grossProfit)}</Td>
                        <Td align="right">{fmt(r.expenses)}</Td>
                        <Td align="right"><span className={r.operatingProfit < 0 ? "text-danger-600" : "font-medium text-ink-900"}>{fmt(r.operatingProfit)}</span></Td>
                        <Td align="right">{pct(r.marginBps)}</Td>
                        <Td align="right">{pct(r.salesShareBps)}</Td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-line-strong bg-ink-50 font-semibold">
                      <Td>Total</Td>
                      <Td align="right">{report.totals.salesCount}</Td>
                      <Td align="right">{fmt(report.totals.netSales)}</Td>
                      <Td align="right">{fmt(report.totals.cogs)}</Td>
                      <Td align="right">{fmt(report.totals.grossProfit)}</Td>
                      <Td align="right">{fmt(report.totals.expenses)}</Td>
                      <Td align="right">{fmt(report.totals.operatingProfit)}</Td>
                      <Td align="right">&nbsp;</Td>
                      <Td align="right">&nbsp;</Td>
                    </tr>
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </Card>
          <p className="text-xs text-ink-500">
            Uses the same calculation as the profit report, so the total equals the profit report for all your branches.
            Closed branches stay included so their history is never lost. Money accounts (Cash, Telebirr, bank) are shared by
            the whole business, not split per branch. This is a management report, not a certified accounting statement.
            A dash means no percentage can be given (no revenue).
          </p>
        </>
      )}
    </div>
  );
}
