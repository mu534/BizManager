import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { resolveContext } from "@server/auth/resolve-context";
import { listSales } from "@server/services/sale.service";
import { prisma } from "@server/db/prisma";
import { Money } from "@shared/money";
import { getCurrentBranch } from "@server/branch/current-branch";

export const metadata: Metadata = { title: "Sales History" };

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: "Completed",
  RETURNED: "Returned",
  PARTIALLY_RETURNED: "Part. Returned",
  VOIDED: "Voided",
};


// Reads session + business-scoped DB data on every request — cannot prerender.
export const instant = false;

export default async function SalesHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ from?: string; to?: string; page?: string }>;
}) {
  const { businessId } = await params;
  const sp = await searchParams;
  const ctx = await resolveContext(businessId).catch(() => null);
  if (!ctx) redirect("/sign-in");

  const branch = await getCurrentBranch(ctx);
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { currency: true } });
  const currency = business?.currency ?? "ETB";

  // Default to today.
  const today = new Date().toISOString().slice(0, 10);
  const from = sp.from ?? today;
  const to = sp.to ?? today;

  const branchCtx = { ...ctx, branchId: branch?.id ?? null };
  const result = await listSales(branchCtx, {
    branchId: branch?.id,
    from: `${from}T00:00:00Z`,
    to: `${to}T23:59:59Z`,
    page: sp.page ? parseInt(sp.page) : 1,
    limit: 30,
  });

  const fmt = (n: number) => Money.format(n, currency);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Sales History</h1>
        <Link href={`/app/${businessId}/sell`}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          New sale
        </Link>
      </div>

      <form method="GET" className="flex flex-wrap gap-3">
        <input name="from" type="date" defaultValue={from}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
        <input name="to" type="date" defaultValue={to}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
        <button type="submit" className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200">
          Filter
        </button>
      </form>

      {result.sales.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-10 text-center">
          <p className="text-sm text-gray-500">No sales for this period.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-200 text-xs text-gray-500">
            {result.total} sales · Total: {fmt(result.sales.reduce((s, sale) => s + sale.finalTotal, 0))}
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-gray-600">Time</th>
                <th className="px-4 py-2.5 text-left font-medium text-gray-600 hidden sm:table-cell">Receipt</th>
                <th className="px-4 py-2.5 text-center font-medium text-gray-600">Status</th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-600">Total</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {result.sales.map((sale) => (
                <tr key={sale.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                    {new Date(sale.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 hidden sm:table-cell">
                    {sale.receiptNumber ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      sale.status === "COMPLETED" ? "bg-green-50 text-green-700" :
                      sale.status === "RETURNED" ? "bg-red-50 text-red-700" :
                      sale.status === "PARTIALLY_RETURNED" ? "bg-amber-50 text-amber-700" :
                      "bg-gray-100 text-gray-500"
                    }`}>
                      {STATUS_LABELS[sale.status] ?? sale.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{fmt(sale.finalTotal)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Link href={`/app/${businessId}/sell/history/${sale.id}`}
                      className="text-sm text-blue-600 hover:underline">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
