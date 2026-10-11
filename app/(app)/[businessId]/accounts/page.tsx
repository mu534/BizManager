import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { resolveContext } from "@server/auth/resolve-context";
import { listAccounts } from "@server/services/financial.service";
import { prisma } from "@server/db/prisma";
import { Money } from "@shared/money";

export const metadata: Metadata = { title: "Financial Accounts" };

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  CASH: "Cash",
  MOBILE_MONEY: "Mobile Money",
  BANK: "Bank",
  OTHER: "Other",
};

export default async function AccountsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const ctx = await resolveContext(businessId).catch(() => null);
  if (!ctx) redirect("/sign-in");

  const [accounts, business] = await Promise.all([
    listAccounts(ctx),
    prisma.business.findUnique({ where: { id: businessId }, select: { currency: true } }),
  ]);
  const currency = business?.currency ?? "ETB";
  const fmt = (n: number) => Money.format(n, currency);
  const totalBalance = accounts.reduce((s, a) => s + a.currentBalance, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Financial Accounts</h1>
        <div className="flex gap-2">
          <Link href={`/app/${businessId}/accounts/transfer`}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Transfer
          </Link>
          <Link href={`/app/${businessId}/accounts/new`}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            Add account
          </Link>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-xs text-gray-500">Total balance across all accounts</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{fmt(totalBalance)}</p>
      </div>

      {accounts.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-10 text-center">
          <p className="text-sm text-gray-500">No accounts yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((a) => (
            <Link key={a.id} href={`/app/${businessId}/accounts/${a.id}`}
              className="rounded-lg border border-gray-200 bg-white p-4 hover:border-blue-300 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{a.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{ACCOUNT_TYPE_LABELS[a.type] ?? a.type}</p>
                </div>
                {a.isDefault && (
                  <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">Default</span>
                )}
              </div>
              <p className="mt-3 text-xl font-bold text-gray-900">{fmt(a.currentBalance)}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
