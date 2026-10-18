import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveContext } from "@server/auth/resolve-context";
import { canViewFinancialReports } from "@server/auth/permissions";
import { getAccount, getAccountTransactions } from "@server/services/financial.service";
import { prisma } from "@server/db/prisma";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Pagination, Stat, Table, TableWrap, Td, Th, type Tone } from "@components/ui/primitives";
import { AccessDenied } from "@components/layout/states";
import { formatDateTime, formatMoney } from "@components/ui/format";

export const metadata: Metadata = { title: "Account" };
const PAGE_SIZE = 30;

const TX: Record<string, { label: string; tone: Tone; sign: 1 | -1 }> = {
  SALE_PAYMENT: { label: "Sale payment", tone: "success", sign: 1 },
  EXPENSE_PAYMENT: { label: "Expense", tone: "warning", sign: -1 },
  REFUND: { label: "Customer refund", tone: "danger", sign: -1 },
  TRANSFER_IN: { label: "Transfer in", tone: "info", sign: 1 },
  TRANSFER_OUT: { label: "Transfer out", tone: "info", sign: -1 },
  MANUAL_CREDIT: { label: "Manual deposit", tone: "neutral", sign: 1 },
  MANUAL_DEBIT: { label: "Manual withdrawal", tone: "neutral", sign: -1 },
  OPENING_BALANCE: { label: "Opening balance", tone: "neutral", sign: 1 },
};


// Reads session + business-scoped DB data on every request — cannot prerender.
export const instant = false;

export default async function AccountDetailPage({ params, searchParams }: { params: Promise<{ businessId: string; accountId: string }>; searchParams: Promise<{ page?: string }> }) {
  const [{ businessId, accountId }, sp] = await Promise.all([params, searchParams]);
  const ctx = await resolveContext(businessId);
  if (!canViewFinancialReports(ctx)) return <AccessDenied businessId={businessId} what="accounts" />;
  const account = await getAccount(ctx, accountId).catch(() => null);
  if (!account) notFound();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const [{ transactions, total }, business] = await Promise.all([
    getAccountTransactions(ctx, accountId, page, PAGE_SIZE),
    prisma.business.findUnique({ where: { id: businessId }, select: { currency: true } }),
  ]);
  const cur = business?.currency ?? "ETB";

  return (
    <>
      <PageHeader title={account.name} breadcrumbs={[{ label: "Accounts", href: `/app/${businessId}/accounts` }, { label: account.name }]} description="Every change to this balance, newest first" />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Current balance" value={formatMoney(account.currentBalance, cur)} emphasis /></div>
      <Card>
        <CardHeader title="Transaction history" />
        {transactions.length === 0 ? <EmptyState title="No transactions yet" /> : (
          <>
            <TableWrap>
              <Table>
                <thead><tr><Th>When</Th><Th>Type</Th><Th align="right">Amount</Th><Th align="right">Balance after</Th><Th>Note</Th></tr></thead>
                <tbody>{transactions.map((t) => {
                  const m = TX[t.type] ?? { label: t.type, tone: "neutral" as Tone, sign: 1 as const };
                  return (
                    <tr key={t.id}>
                      <Td className="whitespace-nowrap text-ink-600">{formatDateTime(t.createdAt)}</Td>
                      <Td><Badge tone={m.tone}>{m.label}</Badge></Td>
                      <Td align="right" className={m.sign > 0 ? "font-semibold text-success-700" : "font-semibold text-ink-900"}>{m.sign > 0 ? "+" : "−"}{formatMoney(t.amount, cur)}</Td>
                      <Td align="right" className="text-ink-600">{formatMoney(t.balanceAfter, cur)}</Td>
                      <Td className="text-ink-600">{t.notes ?? "—"}</Td>
                    </tr>
                  );
                })}</tbody>
              </Table>
            </TableWrap>
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefFor={(p) => `/app/${businessId}/accounts/${accountId}?page=${p}`} />
          </>
        )}
      </Card>
    </>
  );
}
