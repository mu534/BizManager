import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { resolveContext } from "@server/auth/resolve-context";
import { listExpenses, listExpenseCategories } from "@server/services/expense.service";
import { prisma } from "@server/db/prisma";
import { Money } from "@shared/money";

export const metadata: Metadata = { title: "Expenses" };

export default async function ExpensesPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ from?: string; to?: string; categoryId?: string; page?: string }>;
}) {
  const { businessId } = await params;
  const sp = await searchParams;
  const ctx = await resolveContext(businessId).catch(() => null);
  if (!ctx) redirect("/sign-in");

  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { currency: true } });
  const currency = business?.currency ?? "ETB";

  const today = new Date().toISOString().slice(0, 10);
  const from = sp.from ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = sp.to ?? today;

  const [categories, result] = await Promise.all([
    listExpenseCategories(ctx),
    listExpenses(ctx, {
      categoryId: sp.categoryId,
      from: `${from}T00:00:00Z`,
      to: `${to}T23:59:59Z`,
      page: sp.page ? parseInt(sp.page) : 1,
      limit: 30,
    }),
  ]);

  const fmt = (n: number) => Money.format(n, currency);
  const total = result.expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Expenses</h1>
        <Link href={`/app/${businessId}/expenses/new`}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          Record expense
        </Link>
      </div>

      <form method="GET" className="flex flex-wrap gap-3">
        <input name="from" type="date" defaultValue={from}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
        <input name="to" type="date" defaultValue={to}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
        <select name="categoryId" defaultValue={sp.categoryId ?? ""}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button type="submit" className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200">
          Filter
        </button>
      </form>

      {result.expenses.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-10 text-center">
          <p className="text-sm text-gray-500">No expenses for this period.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-200 text-sm font-medium text-gray-700">
            Total: {fmt(total)}
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-gray-600">Date</th>
                <th className="px-4 py-2.5 text-left font-medium text-gray-600">Category</th>
                <th className="px-4 py-2.5 text-left font-medium text-gray-600 hidden sm:table-cell">Description</th>
                <th className="px-4 py-2.5 text-left font-medium text-gray-600 hidden md:table-cell">Account</th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-600">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {result.expenses.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                    {new Date(e.expenseDate).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2.5 text-gray-900">{e.category.name}</td>
                  <td className="px-4 py-2.5 text-gray-500 hidden sm:table-cell">{e.description ?? "—"}</td>
                  <td className="px-4 py-2.5 text-gray-500 hidden md:table-cell">{e.account.name}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-gray-900">{fmt(e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
