import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { resolveContext } from "@server/auth/resolve-context";
import { getSale } from "@server/services/sale.service";
import { prisma } from "@server/db/prisma";
import { Money } from "@shared/money";

export const metadata: Metadata = { title: "Sale Detail" };

export default async function SaleDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; saleId: string }>;
}) {
  const { businessId, saleId } = await params;
  const ctx = await resolveContext(businessId).catch(() => null);
  if (!ctx) redirect("/sign-in");

  const sale = await getSale(ctx, saleId).catch(() => null);
  if (!sale) redirect(`/app/${businessId}/sell/history`);

  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { currency: true, name: true } });
  const currency = business?.currency ?? "ETB";
  const fmt = (n: number) => Money.format(n, currency);
  const canReturn = ctx.role === "OWNER" || ctx.role === "MANAGER";

  return (
    <div className="max-w-2xl space-y-4 print:max-w-none">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Link href={`/app/${businessId}/sell/history`} className="text-sm text-gray-500 hover:text-gray-900">← Sales</Link>
          <h1 className="text-xl font-semibold text-gray-900">Sale Detail</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
            Print
          </button>
          {canReturn && (sale.status === "COMPLETED" || sale.status === "PARTIALLY_RETURNED") && (
            <Link href={`/app/${businessId}/sell/history/${saleId}/return`}
              className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
              Process return
            </Link>
          )}
        </div>
      </div>

      {/* Receipt */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
        <div className="text-center border-b border-gray-200 pb-4">
          <p className="font-semibold text-gray-900">{business?.name ?? "BizManager"}</p>
          {sale.receiptNumber && <p className="text-sm text-gray-500 mt-1">Receipt #{sale.receiptNumber}</p>}
          <p className="text-xs text-gray-400 mt-1">{new Date(sale.createdAt).toLocaleString()}</p>
          <p className="text-xs text-gray-400">Branch: {sale.branch.name}</p>
        </div>

        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="py-1.5 text-left font-medium text-gray-600">Item</th>
              <th className="py-1.5 text-center font-medium text-gray-600">Qty</th>
              <th className="py-1.5 text-right font-medium text-gray-600">Price</th>
              <th className="py-1.5 text-right font-medium text-gray-600">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sale.items.map((item) => (
              <tr key={item.id}>
                <td className="py-1.5 text-gray-900">
                  {item.productName}
                  {item.productSku && <span className="ml-1 text-xs text-gray-400">({item.productSku})</span>}
                </td>
                <td className="py-1.5 text-center text-gray-600">{item.quantity}</td>
                <td className="py-1.5 text-right text-gray-600">{fmt(item.unitPrice)}</td>
                <td className="py-1.5 text-right font-medium text-gray-900">{fmt(item.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="border-t border-gray-200 pt-3 space-y-1 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Subtotal</span><span>{fmt(sale.subtotal)}</span>
          </div>
          {sale.discountAmount > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Discount</span><span>−{fmt(sale.discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-base">
            <span>Total</span><span>{fmt(sale.finalTotal)}</span>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-3 text-sm">
          <p className="text-gray-600 font-medium mb-1">Payment</p>
          {sale.payments.map((p) => (
            <div key={p.id} className="flex justify-between text-gray-600">
              <span>{p.account.name}</span><span>{fmt(p.amount)}</span>
            </div>
          ))}
        </div>

        {sale.returns.length > 0 && (
          <div className="border-t border-gray-200 pt-3 text-sm">
            <p className="text-gray-600 font-medium mb-1">Returns</p>
            {sale.returns.map((r) => (
              <div key={r.id} className="flex justify-between text-amber-600">
                <span>{new Date(r.createdAt).toLocaleDateString()} — {r.reason ?? "Return"}</span>
                <span>−{fmt(r.totalRefund)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-gray-200 pt-3 flex justify-between text-xs text-gray-400">
          <span>Served by: {sale.createdBy.name}</span>
          <span>Status: {sale.status}</span>
        </div>
      </div>
    </div>
  );
}
