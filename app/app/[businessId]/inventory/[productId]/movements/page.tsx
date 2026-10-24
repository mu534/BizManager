import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { resolveContext } from "@server/auth/resolve-context";
import { getMovementHistory } from "@server/services/inventory.service";
import { prisma } from "@server/db/prisma";
import { Money } from "@shared/money";
import { getCurrentBranch } from "@server/branch/current-branch";

export const metadata: Metadata = { title: "Movement History" };

const TYPE_LABELS: Record<string, string> = {
  OPENING_STOCK: "Opening Stock",
  PURCHASE: "Stock Receipt",
  SALE: "Sale",
  SALE_RETURN: "Return",
  DAMAGE: "Damage",
  MANUAL_ADJUST: "Adjustment",
  TRANSFER_IN: "Transfer In",
  TRANSFER_OUT: "Transfer Out",
};


// Reads session + business-scoped DB data on every request — cannot prerender.
export const instant = false;

export default async function MovementHistoryPage({
  params,
}: {
  params: Promise<{ businessId: string; productId: string }>;
}) {
  const { businessId, productId } = await params;
  const ctx = await resolveContext(businessId).catch(() => null);
  if (!ctx) redirect("/sign-in");

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { name: true, businessId: true, costPrice: true },
  });
  if (!product || product.businessId !== businessId) redirect(`/app/${businessId}/inventory`);

  const branch = await getCurrentBranch(ctx);
  if (!branch) redirect(`/app/${businessId}/inventory`);

  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { currency: true } });
  const currency = business?.currency ?? "ETB";

  const { movements, total } = await getMovementHistory(ctx, productId, branch.id, { page: 1, limit: 50 });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href={`/app/${businessId}/inventory`} className="text-sm text-gray-500 hover:text-gray-900">← Inventory</Link>
        <h1 className="text-xl font-semibold text-gray-900">{product.name} — Stock History</h1>
      </div>

      {movements.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-10 text-center">
          <p className="text-sm text-gray-500">No movements recorded yet.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-200 text-xs text-gray-500">{total} movements total</div>
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-gray-600">Date</th>
                <th className="px-4 py-2.5 text-left font-medium text-gray-600">Type</th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-600">Qty</th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-600 hidden sm:table-cell">Unit Cost</th>
                <th className="px-4 py-2.5 text-left font-medium text-gray-600 hidden md:table-cell">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {movements.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                    {new Date(m.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2.5 text-gray-900">{TYPE_LABELS[m.type] ?? m.type}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${m.quantity > 0 ? "text-green-600" : "text-red-600"}`}>
                    {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-500 hidden sm:table-cell">
                    {m.unitCost ? Money.format(m.unitCost, currency) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 hidden md:table-cell">{m.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
