import type { Metadata } from "next";
import { resolveContext } from "@server/auth/resolve-context";
import { canViewFinancialReports } from "@server/auth/permissions";
import { listAccounts } from "@server/services/financial.service";
import { prisma } from "@server/db/prisma";
import { Alert, PageHeader } from "@components/ui/primitives";
import { AccessDenied } from "@components/layout/states";
import { TransferFormClient } from "./transfer-form-client";

export const metadata: Metadata = { title: "Transfer or adjust" };


// Reads session + business-scoped DB data on every request — cannot prerender.
export const instant = false;

export default async function TransferPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const ctx = await resolveContext(businessId);
  if (!canViewFinancialReports(ctx)) return <AccessDenied businessId={businessId} what="account transfers" />;
  const [accounts, business] = await Promise.all([listAccounts(ctx), prisma.business.findUnique({ where: { id: businessId }, select: { currency: true } })]);
  return (
    <div className="max-w-lg space-y-4">
      <PageHeader title="Transfer or adjust" description="Move money between accounts, or record a manual deposit or withdrawal."
        breadcrumbs={[{ label: "Accounts", href: `/app/${businessId}/accounts` }, { label: "Transfer" }]} />
      <Alert tone="info">Transfers move money you already have. They are never counted as sales or expenses.</Alert>
      <TransferFormClient businessId={businessId} currency={business?.currency ?? "ETB"} accounts={accounts.filter((a) => a.status === "ACTIVE").map((a) => ({ id: a.id, name: a.name, balance: a.currentBalance }))} />
    </div>
  );
}
