import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolveContext } from "@server/auth/resolve-context";
import { recordOpeningStock, recordStockReceipt, adjustStock, recordDamage } from "@server/services/inventory.service";
import { prisma } from "@server/db/prisma";
import { isAppError } from "@shared/errors";

export const metadata: Metadata = { title: "Adjust Stock" };

const MOVEMENT_TYPES = [
  { value: "OPENING_STOCK", label: "Opening Stock", needsCost: true },
  { value: "PURCHASE", label: "Stock Receipt (Purchase)", needsCost: true },
  { value: "MANUAL_ADJUST", label: "Manual Adjustment", needsCost: false },
  { value: "DAMAGE", label: "Damage / Loss", needsCost: false },
] as const;


// Reads session + business-scoped DB data on every request — cannot prerender.
export const instant = false;

export default async function AdjustStockPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ productId?: string; error?: string }>;
}) {
  const { businessId } = await params;
  const sp = await searchParams;
  const ctx = await resolveContext(businessId).catch(() => null);
  if (!ctx) redirect("/sign-in");

  const [products, branch] = await Promise.all([
    prisma.product.findMany({
      where: { businessId, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, sku: true },
    }),
    prisma.branch.findFirst({ where: { businessId, isDefault: true, status: "ACTIVE" } }),
  ]);

  if (!branch) return <p className="text-sm text-gray-500">No active branch found.</p>;

  async function handleAdjust(formData: FormData) {
    "use server";
    const ctxInner = await resolveContext(businessId).catch(() => null);
    if (!ctxInner) redirect("/sign-in");

    const branchId = String(formData.get("branchId"));
    const productId = String(formData.get("productId"));
    const type = String(formData.get("type")) as "OPENING_STOCK" | "PURCHASE" | "MANUAL_ADJUST" | "DAMAGE";
    const qty = parseInt(String(formData.get("quantity")));
    const unitCost = String(formData.get("unitCost") || "0");
    const notes = String(formData.get("notes") || "");
    const reason = String(formData.get("reason") || notes || "Manual adjustment");

    const branchCtx = { ...ctxInner, branchId };

    try {
      if (type === "OPENING_STOCK") {
        await recordOpeningStock(branchCtx, { productId, branchId, quantity: qty, unitCost, notes: notes || undefined });
      } else if (type === "PURCHASE") {
        await recordStockReceipt(branchCtx, { productId, branchId, quantity: qty, unitCost, notes: notes || undefined });
      } else if (type === "DAMAGE") {
        await recordDamage(branchCtx, { productId, branchId, quantity: qty, notes: notes || undefined });
      } else {
        await adjustStock(branchCtx, { productId, branchId, quantity: qty, reason, notes: notes || undefined });
      }
    } catch (err) {
      if (isAppError(err)) {
        redirect(`/app/${businessId}/inventory/adjust?error=${encodeURIComponent(err.message)}`);
      }
      throw err;
    }
    redirect(`/app/${businessId}/inventory`);
  }

  return (
    <div className="max-w-lg space-y-6">
      <div className="flex items-center gap-3">
        <a href={`/app/${businessId}/inventory`} className="text-sm text-gray-500 hover:text-gray-900">← Inventory</a>
        <h1 className="text-xl font-semibold text-gray-900">Adjust stock</h1>
      </div>

      {sp.error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {decodeURIComponent(sp.error)}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <form action={handleAdjust} className="space-y-4">
          <input type="hidden" name="branchId" value={branch.id} />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Product *</label>
            <select name="productId" defaultValue={sp.productId ?? ""} required
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="">Select product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ""}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Movement type *</label>
            <select name="type" required
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
              {MOVEMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quantity *
              <span className="ml-1 font-normal text-gray-400 text-xs">(negative to remove for manual adjustment)</span>
            </label>
            <input name="quantity" type="number" required
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Unit cost (for stock receipts)</label>
            <input name="unitCost" type="number" step="0.01" defaultValue="0"
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason / Notes</label>
            <input name="notes" type="text"
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Optional description" />
            <input type="hidden" name="reason" value="Manual adjustment" />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              Record movement
            </button>
            <a href={`/app/${businessId}/inventory`}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
