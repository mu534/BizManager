import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { resolveContext } from "@server/auth/resolve-context";
import { listProducts } from "@server/services/product.service";
import { prisma } from "@server/db/prisma";
import { Money } from "@shared/money";

export const metadata: Metadata = { title: "Products" };

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

  const branch = await prisma.branch.findFirst({
    where: { businessId, isDefault: true, status: "ACTIVE" },
  });
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
        <h1 className="text-xl font-semibold text-gray-900">Products</h1>
        <Link
          href={`/app/${businessId}/products/new`}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
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
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm w-56 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <select
          name="categoryId"
          defaultValue={sp.categoryId ?? ""}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={sp.status ?? "ACTIVE"}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="ACTIVE">Active</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <button
          type="submit"
          className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          Filter
        </button>
      </form>

      {/* Table */}
      {result.products.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No products found.</p>
          <Link
            href={`/app/${businessId}/products/new`}
            className="mt-3 inline-block text-sm font-medium text-blue-600 hover:underline"
          >
            Add your first product
          </Link>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-gray-600">Name</th>
                <th className="px-4 py-2.5 text-left font-medium text-gray-600 hidden sm:table-cell">SKU</th>
                <th className="px-4 py-2.5 text-left font-medium text-gray-600 hidden md:table-cell">Category</th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-600">Cost</th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-600">Price</th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-600">Stock</th>
                <th className="px-4 py-2.5 text-center font-medium text-gray-600">Status</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {result.products.map((p) => {
                const stock = p.stockSnapshot?.quantity ?? 0;
                const isLow = stock <= p.minStockLevel;
                const cat = (p as typeof p & { category?: { name: string } | null }).category;
                return (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-900">
                      {p.name}
                      {p.barcode && (
                        <span className="ml-2 text-xs text-gray-400">{p.barcode}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 hidden sm:table-cell">{p.sku ?? "—"}</td>
                    <td className="px-4 py-2.5 text-gray-500 hidden md:table-cell">{cat?.name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{Money.format(p.costPrice, currency)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-900 font-medium">{Money.format(p.sellingPrice, currency)}</td>
                    <td className={`px-4 py-2.5 text-right font-medium ${isLow ? "text-amber-600" : "text-gray-900"}`}>
                      {stock}
                      {isLow && <span className="ml-1 text-xs">⚠</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        p.status === "ACTIVE" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                      }`}>
                        {p.status === "ACTIVE" ? "Active" : "Archived"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        href={`/app/${businessId}/products/${p.id}`}
                        className="text-sm text-blue-600 hover:underline"
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
            <div className="border-t border-gray-200 px-4 py-2.5 text-sm text-gray-500">
              Showing {result.products.length} of {result.total}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
