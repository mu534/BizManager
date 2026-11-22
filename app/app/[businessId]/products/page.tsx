import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { resolveContext } from "@server/auth/resolve-context";
import { listProducts } from "@server/services/product.service";
import { prisma } from "@server/db/prisma";
import { Money } from "@shared/money";
import { getCurrentBranch } from "@server/branch/current-branch";

export const metadata: Metadata = { title: "Products" };


// Reads session + business-scoped DB data on every request — cannot prerender.
export const instant = false;

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ q?: string; status?: string; categoryId?: string; page?: string }>;
}) {
  const { businessId } = await params;
  const sp = await searchParams;
  const ctx = await resolveContext(businessId).catch(() => null);
  if (!ctx) redirect("/sign-in");

  const branch = await getCurrentBranch(ctx);
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { currency: true },
  });
  const currency = business?.currency ?? "ETB";

  const branchCtx = branch ? { ...ctx, branchId: branch.id } : ctx;
  const result = await listProducts(branchCtx, {
    query: sp.q,
    categoryId: sp.categoryId,
    status: (sp.status as "ACTIVE" | "ARCHIVED") ?? "ACTIVE",
    page: sp.page ? parseInt(sp.page) : 1,
    limit: 30,
  });

  const categories = await prisma.category.findMany({
    where: { businessId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink-900">Products</h1>
        <Link
          href={`/app/${businessId}/products/new`}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Add product
        </Link>
      </div>

      {/* Filters */}
      <form method="GET" className="flex flex-wrap gap-3">
        <input
          name="q"
          defaultValue={sp.q}
          placeholder="Search name, SKU, barcode…"
          className="rounded-md border border-ink-300 px-3 py-1.5 text-sm shadow-sm w-56 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <select
          name="categoryId"
          defaultValue={sp.categoryId ?? ""}
          className="rounded-md border border-ink-300 px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={sp.status ?? "ACTIVE"}
          className="rounded-md border border-ink-300 px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="ACTIVE">Active</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <button
          type="submit"
          className="rounded-md bg-ink-100 px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-200"
        >
          Filter
        </button>
      </form>

      {/* Table */}
      {result.products.length === 0 ? (
        <div className="rounded-lg border border-ink-200 bg-white px-6 py-12 text-center">
          <p className="text-sm text-ink-500">No products found.</p>
          <Link
            href={`/app/${businessId}/products/new`}
            className="mt-3 inline-block text-sm font-medium text-brand-600 hover:underline"
          >
            Add your first product
          </Link>
        </div>
      ) : (
        <div className="rounded-lg border border-ink-200 bg-white overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-ink-50 border-b border-ink-200">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-ink-600">Name</th>
                <th className="px-4 py-2.5 text-left font-medium text-ink-600 hidden sm:table-cell">SKU</th>
                <th className="px-4 py-2.5 text-left font-medium text-ink-600 hidden md:table-cell">Category</th>
                <th className="px-4 py-2.5 text-right font-medium text-ink-600">Cost</th>
                <th className="px-4 py-2.5 text-right font-medium text-ink-600">Price</th>
                <th className="px-4 py-2.5 text-right font-medium text-ink-600">Stock</th>
                <th className="px-4 py-2.5 text-center font-medium text-ink-600">Status</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {result.products.map((p) => {
                const stock = p.stockSnapshot?.quantity ?? 0;
                const isLow = stock <= p.minStockLevel;
                const cat = (p as typeof p & { category?: { name: string } | null }).category;
                return (
                  <tr key={p.id} className="hover:bg-ink-50">
                    <td className="px-4 py-2.5 font-medium text-ink-900">
                      {p.name}
                      {p.barcode && (
                        <span className="ml-2 text-xs text-ink-400">{p.barcode}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-ink-500 hidden sm:table-cell">{p.sku ?? "—"}</td>
                    <td className="px-4 py-2.5 text-ink-500 hidden md:table-cell">{cat?.name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right text-ink-600">{Money.format(p.costPrice, currency)}</td>
                    <td className="px-4 py-2.5 text-right text-ink-900 font-medium">{Money.format(p.sellingPrice, currency)}</td>
                    <td className={`px-4 py-2.5 text-right font-medium ${isLow ? "text-amber-600" : "text-ink-900"}`}>
                      {stock}
                      {isLow && <span className="ml-1 text-xs">⚠</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        p.status === "ACTIVE" ? "bg-green-50 text-green-700" : "bg-ink-100 text-ink-500"
                      }`}>
                        {p.status === "ACTIVE" ? "Active" : "Archived"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        href={`/app/${businessId}/products/${p.id}`}
                        className="text-sm text-brand-600 hover:underline"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {result.total > result.limit && (
            <div className="border-t border-ink-200 px-4 py-2.5 text-sm text-ink-500">
              Showing {result.products.length} of {result.total}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
