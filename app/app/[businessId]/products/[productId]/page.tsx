import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolveContext } from "@server/auth/resolve-context";
import { getProduct, updateProduct, archiveProduct } from "@server/services/product.service";
import { updateProductSchema } from "@shared/validation/product.schema";
import { prisma } from "@server/db/prisma";
import { Money } from "@shared/money";
import { isAppError } from "@shared/errors";

export const metadata: Metadata = { title: "Edit Product" };

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; productId: string }>;
}) {
  const { businessId, productId } = await params;
  const ctx = await resolveContext(businessId).catch(() => null);
  if (!ctx) redirect("/sign-in");

  const product = await getProduct(ctx, productId).catch(() => null);
  if (!product) redirect(`/app/${businessId}/products`);

  const [categories, business] = await Promise.all([
    prisma.category.findMany({ where: { businessId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.business.findUnique({ where: { id: businessId }, select: { currency: true } }),
  ]);
  const currency = business?.currency ?? "ETB";

  async function handleUpdate(formData: FormData) {
    "use server";
    const ctxInner = await resolveContext(businessId).catch(() => null);
    if (!ctxInner) redirect("/sign-in");
    const raw = {
      name: formData.get("name") as string,
      sku: (formData.get("sku") as string) || undefined,
      barcode: (formData.get("barcode") as string) || undefined,
      categoryId: (formData.get("categoryId") as string) || undefined,
      brand: (formData.get("brand") as string) || undefined,
      unit: (formData.get("unit") as string) || "pcs",
      costPrice: formData.get("costPrice") as string,
      sellingPrice: formData.get("sellingPrice") as string,
      minStockLevel: parseInt(String(formData.get("minStockLevel") ?? "0")),
      description: (formData.get("description") as string) || undefined,
    };
    const parsed = updateProductSchema.safeParse(raw);
    if (!parsed.success) redirect(`/app/${businessId}/products/${productId}?error=validation`);
    try {
      await updateProduct(ctxInner, productId, parsed.data);
    } catch (err) {
      if (isAppError(err)) redirect(`/app/${businessId}/products/${productId}?error=${encodeURIComponent(err.message)}`);
      throw err;
    }
    redirect(`/app/${businessId}/products`);
  }

  async function handleArchive() {
    "use server";
    const ctxInner = await resolveContext(businessId).catch(() => null);
    if (!ctxInner) redirect("/sign-in");
    await archiveProduct(ctxInner, productId);
    redirect(`/app/${businessId}/products`);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href={`/app/${businessId}/products`} className="text-sm text-gray-500 hover:text-gray-900">← Products</a>
          <h1 className="text-xl font-semibold text-gray-900">{product.name}</h1>
        </div>
        {product.status === "ACTIVE" && (
          <form action={handleArchive}>
            <button type="submit" className="text-sm text-red-600 hover:underline">Archive</button>
          </form>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <form action={handleUpdate} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <F label="Product name *" name="name" defaultValue={product.name} />
            <F label="Unit" name="unit" defaultValue={product.unit} />
            <F label="SKU / Code" name="sku" defaultValue={product.sku ?? ""} />
            <F label="Barcode" name="barcode" defaultValue={product.barcode ?? ""} />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select name="categoryId" defaultValue={product.categoryId ?? ""}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="">No category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <F label="Brand" name="brand" defaultValue={product.brand ?? ""} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <F label="Cost price *" name="costPrice" type="number" step="0.01"
              defaultValue={Money.toDecimalString(product.costPrice, currency)} />
            <F label="Selling price *" name="sellingPrice" type="number" step="0.01"
              defaultValue={Money.toDecimalString(product.sellingPrice, currency)} />
            <F label="Min stock level" name="minStockLevel" type="number"
              defaultValue={String(product.minStockLevel)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea name="description" rows={2} defaultValue={product.description ?? ""}
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              Save changes
            </button>
            <a href={`/app/${businessId}/products`}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}

function F({ label, name, defaultValue, type = "text", step }: {
  label: string; name: string; defaultValue?: string; type?: string; step?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input name={name} type={type} step={step} defaultValue={defaultValue}
        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
    </div>
  );
}
