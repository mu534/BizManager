import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolveContext } from "@server/auth/resolve-context";
import { listAccounts } from "@server/services/financial.service";
import { prisma } from "@server/db/prisma";
import { Money } from "@shared/money";
import { TransferFormClient } from "./transfer-form-client";

export const metadata: Metadata = { title: "Transfer Funds" };

export default async function TransferPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const ctx = await resolveContext(businessId).catch(() => null);
  if (!ctx) redirect("/sign-in");

  const [accounts, business] = await Promise.all([
    listAccounts(ctx),
    prisma.business.findUnique({ where: { id: businessId }, select: { currency: true } }),
  ]);

  return (
    <div className="max-w-md space-y-6">
      <div className="flex items-center gap-3">
        <a href={`/app/${businessId}/accounts`} className="text-sm text-gray-500 hover:text-gray-900">← Accounts</a>
        <h1 className="text-xl font-semibold text-gray-900">Transfer funds</h1>
      </div>
      <p className="text-sm text-gray-500">
        Transfers move money between accounts. They do not count as revenue or expenses.
      </p>
      <TransferFormClient
        businessId={businessId}
        currency={business?.currency ?? "ETB"}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, balance: a.currentBalance }))}
      />
    </div>
  );
}
