import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { resolveContext } from "@server/auth/resolve-context";
import { listExpenses, listExpenseCategories } from "@server/services/expense.service";
import { prisma } from "@server/db/prisma";
import { Money } from "@shared/money";

export const metadata: Metadata = { title: "Expenses" };


// Reads session + business-scoped DB data on every request — cannot prerender.
export const instant = false;

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
        <h1 className="text-xl font-semibold text-ink-900">Expenses</h1>
        <Link href={`/app/${businessId}/expenses/new`}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          Record expense
        </Link>
      </div>

      <form method="GET" className="flex flex-wrap gap-3">
        <input name="from" type="date" defaultValue={from}
          className="rounded-md border border-line-strong px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-brand-600" />
        <input name="to" type="date" defaultValue={to}
          className="rounded-md border border-line-strong px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-brand-600" />
        <select name="categoryId" defaultValue={sp.categoryId ?? ""}
          className="rounded-md border border-line-strong px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-brand-600">
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button type="submit" className="rounded-md bg-ink-100 px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-200">
          Filter
        </button>
      </form>

      {result.expenses.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface px-6 py-10 text-center">
          <p className="text-sm text-ink-500">No expenses for this period.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-line bg-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-line text-sm font-medium text-ink-700">
            Total: {fmt(total)}
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-ink-50 border-b border-line">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-ink-600">Date</th>
                <th className="px-4 py-2.5 text-left font-medium text-ink-600">Category</th>
                <th className="px-4 py-2.5 text-left font-medium text-ink-600 hidden sm:table-cell">Description</th>
                <th className="px-4 py-2.5 text-left font-medium text-ink-600 hidden md:table-cell">Account</th>
                <th className="px-4 py-2.5 text-right font-medium text-ink-600">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {result.expenses.map((e) => (
                <tr key={e.id} className="hover:bg-ink-50">
                  <td className="px-4 py-2.5 text-ink-600 whitespace-nowrap">
                    {new Date(e.expenseDate).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2.5 text-ink-900">{e.category.name}</td>
                  <td className="px-4 py-2.5 text-ink-500 hidden sm:table-cell">{e.description ?? "—"}</td>
                  <td className="px-4 py-2.5 text-ink-500 hidden md:table-cell">{e.account.name}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-ink-900">{fmt(e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
