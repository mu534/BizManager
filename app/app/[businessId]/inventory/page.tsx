import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { resolveContext } from "@server/auth/resolve-context";
import { getStockLevels, getLowStockProducts } from "@server/services/inventory.service";
import { prisma } from "@server/db/prisma";
import { Money } from "@shared/money";
import { getCurrentBranch } from "@server/branch/current-branch";

export const metadata: Metadata = { title: "Inventory" };


// Reads session + business-scoped DB data on every request — cannot prerender.
export const instant = false;

export default async function InventoryPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const ctx = await resolveContext(businessId).catch(() => null);
  if (!ctx) redirect("/sign-in");

  const branch = await getCurrentBranch(ctx);
  if (!branch) {
    return <p className="text-sm text-gray-500">No active branch found.</p>;
  }

  const business = await prisma.business.findUnique({
    where: { id: businessId }, select: { currency: true },
  });
  const currency = business?.currency ?? "ETB";
  const branchCtx = { ...ctx, branchId: branch.id };

  const [stockLevels, lowStock] = await Promise.all([
    getStockLevels(branchCtx, branch.id),
    getLowStockProducts(branchCtx, branch.id),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Inventory — {branch.name}</h1>
        <Link href={`/app/${businessId}/inventory/adjust`}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          Adjust stock
        </Link>
      </div>

      {lowStock.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-800 mb-2">
            {lowStock.length} product{lowStock.length > 1 ? "s" : ""} below minimum stock level
          </p>
          <ul className="space-y-1">
            {lowStock.map(({ product, snapshot }) => (
              <li key={product.id} className="text-sm text-amber-700">
                {product.name} — {snapshot.quantity} / {product.minStockLevel} min
              </li>
            ))}
          </ul>
        </div>
      )}

      {stockLevels.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No stock recorded yet.</p>
          <Link href={`/app/${businessId}/inventory/adjust`}
            className="mt-3 inline-block text-sm font-medium text-blue-600 hover:underline">
            Record opening stock
          </Link>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-gray-600">Product</th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-600">In Stock</th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-600 hidden sm:table-cell">Min Level</th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-600 hidden md:table-cell">Unit Cost</th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-600 hidden md:table-cell">Value</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stockLevels.map(({ product, snapshot }) => {
                const isLow = snapshot.quantity <= product.minStockLevel;
                return (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-900">
                      {product.name}
                      {product.sku && <span className="ml-2 text-xs text-gray-400">{product.sku}</span>}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${isLow ? "text-amber-600" : "text-gray-900"}`}>
                      {snapshot.quantity} {isLow && "⚠"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-500 hidden sm:table-cell">{product.minStockLevel}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600 hidden md:table-cell">{Money.format(product.costPrice, currency)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600 hidden md:table-cell">
                      {Money.format(product.costPrice * snapshot.quantity, currency)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link href={`/app/${businessId}/inventory/${product.id}/movements`}
                        className="text-sm text-blue-600 hover:underline">
                        History
                      </Link>
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
