import type { Metadata } from "next";
import Link from "next/link";
import { resolveContext } from "@server/auth/resolve-context";
import { getCustomerDetail } from "@server/services/customer.service";
import { listAccounts } from "@server/services/financial.service";
import { prisma } from "@server/db/prisma";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Stat, Table, TableWrap, Td, Th } from "@components/ui/primitives";
import { AccessDenied } from "@components/layout/states";
import { ButtonLink } from "@components/ui/button";
import { ActionForm, SelectField, TextField } from "@components/forms/action-form";
import { formatDate, formatMoney } from "@components/ui/format";
import { receivePaymentAction } from "../actions";

export const metadata: Metadata = { title: "Customer" };

// Reads session + business-scoped DB data on every request — cannot prerender.
export const instant = false;

const METHOD: Record<string, string> = { CASH: "Cash", TELEBIRR: "Mobile money", BANK: "Bank" };

export default async function CustomerPage({ params }: { params: Promise<{ businessId: string; customerId: string }> }) {
  const { businessId, customerId } = await params;
  const ctx = await resolveContext(businessId);
  if (ctx.role === "STAFF") return <AccessDenied businessId={businessId} what="customers" />;

  const [c, accounts, business] = await Promise.all([
    getCustomerDetail(ctx, customerId),
    listAccounts(ctx),
    prisma.business.findUnique({ where: { id: businessId }, select: { currency: true } }),
  ]);
  const currency = business?.currency ?? "ETB";
  const money = (n: number) => formatMoney(n, currency);
  const receiving = accounts.filter(
    (a) => a.status === "ACTIVE" && (a.type === "CASH" || a.type === "MOBILE_MONEY" || a.type === "BANK"),
  );
  const open = c.debts.filter((d) => d.outstandingMinor > 0);
  // One id per page view: a double tap on "Record payment" cannot apply twice.
  const operationId = crypto.randomUUID();

  return (
    <>
      <PageHeader
        title={c.name}
        description={[c.phone, c.email].filter(Boolean).join(" · ") || "No contact details saved"}
        breadcrumbs={[{ label: "Customers", href: `/app/${businessId}/customers` }, { label: c.name }]}
        actions={<ButtonLink href={`/app/${businessId}/customers/${customerId}/edit`} variant="secondary">Edit details</ButtonLink>}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <Stat label="Owes you now" value={money(c.owedMinor)} tone={c.owedMinor > 0 ? "negative" : "neutral"} emphasis />
        <Stat label="Unpaid sales" value={String(open.length)} sub={`${c.debts.length} sales on credit in total`} />
      </div>
      {c.notes && <p className="mb-5 rounded-card border border-line bg-surface p-4 text-sm text-ink-700">{c.notes}</p>}

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Sales on credit" description="Oldest unpaid sales are paid off first." />
            {c.debts.length === 0 ? (
              <EmptyState title="No credit sales yet" description="Choose this customer at the till and put part or all of a sale on their tab." />
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>Sale</Th>
                      <Th>Date</Th>
                      <Th align="right">On credit</Th>
                      <Th align="right">Still owed</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.debts.map((d) => (
                      <tr key={d.id}>
                        <Td>
                          <Link href={`/app/${businessId}/sell/history/${d.saleId}`} className="text-brand-700 hover:underline">
                            {d.receiptNumber ?? "Receipt"}
                          </Link>
                        </Td>
                        <Td>{formatDate(d.createdAt)}</Td>
                        <Td align="right" className="tabular-nums">{money(d.originalMinor)}</Td>
                        <Td align="right">
                          {d.outstandingMinor > 0 ? (
                            <span className="font-semibold tabular-nums text-ink-900">{money(d.outstandingMinor)}</span>
                          ) : (
                            <Badge tone="success">Paid</Badge>
                          )}
                          {d.returnedMinor > 0 && (
                            <span className="block text-xs text-ink-500">{money(d.returnedMinor)} cancelled by a return</span>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </Card>

          <Card>
            <CardHeader title="Payments received" />
            {c.repayments.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-ink-500">No payments yet.</p>
            ) : (
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>Date</Th>
                      <Th>Method</Th>
                      <Th align="right">Amount</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.repayments.map((r) => (
                      <tr key={r.id}>
                        <Td>{formatDate(r.createdAt)}</Td>
                        <Td>{METHOD[r.paymentMethod] ?? r.paymentMethod}</Td>
                        <Td align="right" className="tabular-nums">{money(r.amountMinor)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </Card>
        </div>

        <Card className="h-fit p-5">
          <h2 className="text-base font-semibold text-ink-900">Record a payment</h2>
          {c.owedMinor === 0 ? (
            <p className="mt-2 text-sm text-ink-500">This customer owes nothing right now.</p>
          ) : receiving.length === 0 ? (
            <p className="mt-2 text-sm text-ink-500">Add a cash, mobile money or bank account first, so there is somewhere to record the money.</p>
          ) : (
            <ActionForm
              className="mt-4 space-y-4"
              action={receivePaymentAction.bind(null, businessId, customerId)}
              submitLabel="Record payment"
            >
              <input type="hidden" name="operationId" value={operationId} />
              <TextField
                name="amount"
                label={`Amount received (${currency})`}
                required
                inputMode="decimal"
                hint={`Up to ${money(c.owedMinor)}.`}
              />
              <SelectField
                name="accountId"
                label="Money went into"
                required
                defaultValue={receiving[0]?.id}
                options={receiving.map((a) => ({ value: a.id, label: a.name }))}
              />
              <TextField name="notes" label="Note" hint="Optional." />
            </ActionForm>
          )}
        </Card>
      </div>
    </>
  );
}