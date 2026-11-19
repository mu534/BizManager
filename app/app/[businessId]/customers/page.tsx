import type { Metadata } from "next";
import Link from "next/link";
import { resolveContext } from "@server/auth/resolve-context";
import { listCustomers } from "@server/services/customer.service";
import { prisma } from "@server/db/prisma";
import { ButtonLink } from "@components/ui/button";
import { Badge, Card, EmptyState, PageHeader, Stat, Table, TableWrap, Td, Th } from "@components/ui/primitives";
import { AccessDenied } from "@components/layout/states";
import { formatMoney } from "@components/ui/format";

export const metadata: Metadata = { title: "Customers" };

// Reads session + business-scoped DB data on every request — cannot prerender.
export const instant = false;

export default async function CustomersPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ q?: string; owing?: string }>;
}) {
  const [{ businessId }, sp] = await Promise.all([params, searchParams]);
  const ctx = await resolveContext(businessId);
  if (ctx.role === "STAFF") return <AccessDenied businessId={businessId} what="customers" />;

  const [all, business] = await Promise.all([
    listCustomers(ctx, { search: sp.q }),
    prisma.business.findUnique({ where: { id: businessId }, select: { currency: true } }),
  ]);
  const currency = business?.currency ?? "ETB";
  const owingOnly = sp.owing === "1";
  const customers = owingOnly ? all.filter((c) => c.owedMinor > 0) : all;
  const totalOwed = all.reduce((s, c) => s + c.owedMinor, 0);
  const owingCount = all.filter((c) => c.owedMinor > 0).length;
  const base = `/app/${businessId}/customers`;

  return (
    <>
      <PageHeader
        title="Customers"
        description="People who buy on credit, and what each one still owes you."
        actions={<ButtonLink href={`${base}/new`}>Add customer</ButtonLink>}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <Stat label="Owed to you" value={formatMoney(totalOwed, currency)} tone={totalOwed > 0 ? "negative" : "neutral"} emphasis />
        <Stat label="Customers who owe" value={String(owingCount)} sub={`${all.length} customers in total`} />
      </div>

      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <label htmlFor="q" className="sr-only">Search customers</label>
        <input
          id="q"
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search by name or phone"
          className="h-10 w-full max-w-xs rounded-control border border-line-strong bg-surface px-3 text-sm"
        />
        <label className="inline-flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" name="owing" value="1" defaultChecked={owingOnly} />
          Only customers who owe
        </label>
        <button type="submit" className="h-10 rounded-control border border-line-strong px-4 text-sm font-medium text-ink-800 hover:bg-ink-50">
          Search
        </button>
      </form>

      {customers.length === 0 ? (
        <EmptyState
          title={all.length === 0 ? "No customers yet" : "No customers match"}
          description={
            all.length === 0
              ? "Add a customer, then choose them at the till when someone buys now and pays later."
              : "Try a different name or clear the filter."
          }
          action={all.length === 0 ? <ButtonLink href={`${base}/new`}>Add customer</ButtonLink> : undefined}
        />
      ) : (
        <Card>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Customer</Th>
                  <Th>Phone</Th>
                  <Th align="right">Owes</Th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id}>
                    <Td>
                      <Link href={`${base}/${c.id}`} className="font-medium text-brand-700 hover:underline">
                        {c.name}
                      </Link>
                    </Td>
                    <Td>{c.phone ?? "—"}</Td>
                    <Td align="right">
                      {c.owedMinor > 0 ? (
                        <span className="inline-flex items-center gap-2">
                          <Badge tone="warning">{c.openDebts} unpaid</Badge>
                          <span className="font-semibold tabular-nums text-ink-900">{formatMoney(c.owedMinor, currency)}</span>
                        </span>
                      ) : (
                        <span className="text-ink-500">Settled</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </Card>
      )}
    </>
  );
}