import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { resolveContext } from "@server/auth/resolve-context";
import { getAccount, getAccountTransactions } from "@server/services/financial.service";
import { prisma } from "@server/db/prisma";
import { Money } from "@shared/money";

export const metadata: Metadata = { title: "Account" };

const TX_TYPE_LABELS: Record<string, string> = {
  SALE_PAYMENT: "Sale",
  EXPENSE_PAYMENT: "Expense",
  TRANSFER_IN: "Transfer In",
  TRANSFER_OUT: "Transfer Out",
  MANUAL_CREDIT: "Deposit",
  MANUAL_DEBIT: "Withdrawal",
  REFUND: "Refund",
};

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; accountId: string }>;
}) {
  const { businessId, accountId } = await params;
  const ctx = await resolveContext(businessId).catch(() => null);
  if (!ctx) redirect("/sign-in");

  const [account, business] = await Promise.all([
    getAccount(ctx, accountId).catch(() => null),
    prisma.business.findUnique({ where: { id: businessId }, select: { currency: true } }),
  ]);
  if (!account) redirect(`/app/${businessId}/accounts`);

  const currency = business?.currency ?? "ETB";
  const { transactions } = await getAccountTransactions(ctx, accountId, 1, 50);
  const fmt = (n: number) => Money.format(n, currency);

  const inflow = ["SALE_PAYMENT", "TRANSFER_IN", "MANUAL_CREDIT"];

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href={`/app/${businessId}/accounts`} className="text-sm text-gray-500 hover:text-gray-900">← Accounts</Link>
        <h1 className="text-xl font-semibold text-gray-900">{account.name}</h1>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">Current Balance</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{fmt(account.currentBalance)}</p>
        </div>
        <Link href={`/app/${businessId}/accounts/transfer`}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
          Transfer
        </Link>
      </div>

      <h2 className="text-sm font-semibold text-gray-700">Transaction history</h2>
      {transactions.length === 0 ? (
        <p className="text-sm text-gray-500">No transactions yet.</p>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-gray-600">Date</th>
                <th className="px-4 py-2.5 text-left font-medium text-gray-600">Type</th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-600">Amount</th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-600 hidden sm:table-cell">Balance after</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transactions.map((t) => {
                const isIn = inflow.includes(t.type);
                return (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                      {new Date(t.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2.5 text-gray-900">{TX_TYPE_LABELS[t.type] ?? t.type}</td>
                    <td className={`px-4 py-2.5 text-right font-medium ${isIn ? "text-green-600" : "text-red-600"}`}>
                      {isIn ? "+" : "−"}{fmt(t.amount)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-500 hidden sm:table-cell">
                      {fmt(t.balanceAfter)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
