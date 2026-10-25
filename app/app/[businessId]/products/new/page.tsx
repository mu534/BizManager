import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolveContext } from "@server/auth/resolve-context";
import { createProduct } from "@server/services/product.service";
import { createProductSchema } from "@shared/validation/product.schema";
import { prisma } from "@server/db/prisma";
import { isAppError } from "@shared/errors";

export const metadata: Metadata = { title: "Add Product" };


// Reads session + business-scoped DB data on every request — cannot prerender.
export const instant = false;

export default async function NewProductPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const ctx = await resolveContext(businessId).catch(() => null);
  if (!ctx) redirect("/sign-in");

  const categories = await prisma.category.findMany({
    where: { businessId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  async function handleCreate(formData: FormData) {
    "use server";
    const ctxInner = await resolveContext(businessId).catch(() => null);
    if (!ctxInner) redirect("/sign-in");

    const raw = {
      name: formData.get("name"),
      sku: formData.get("sku") || undefined,
      barcode: formData.get("barcode") || undefined,
      categoryId: formData.get("categoryId") || undefined,
      brand: formData.get("brand") || undefined,
      unit: formData.get("unit") || "pcs",
      costPrice: formData.get("costPrice"),
      sellingPrice: formData.get("sellingPrice"),
      minStockLevel: parseInt(String(formData.get("minStockLevel") ?? "0")),
      description: formData.get("description") || undefined,
    };

    const parsed = createProductSchema.safeParse(raw);
    if (!parsed.success) {
      // Re-render with errors — for simplicity redirect back with error param.
      redirect(`/app/${businessId}/products/new?error=${encodeURIComponent(JSON.stringify(parsed.error.flatten().fieldErrors))}`);
    }

    try {
      await createProduct(ctxInner, parsed.data);
    } catch (err) {
      if (isAppError(err)) {
        redirect(`/app/${businessId}/products/new?error=${encodeURIComponent(err.message)}`);
      }
      throw err;
    }

    redirect(`/app/${businessId}/products`);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <a href={`/app/${businessId}/products`} className="text-sm text-ink-500 hover:text-ink-900">← Products</a>
        <h1 className="text-xl font-semibold text-ink-900">Add product</h1>
      </div>

      <div className="rounded-lg border border-line bg-surface p-6">
        <form action={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Product name *" name="name" placeholder="e.g. Men's Shirt" />
            <FormField label="Unit" name="unit" placeholder="pcs" defaultValue="pcs" />
            <FormField label="SKU / Code" name="sku" placeholder="Optional" />
            <FormField label="Barcode" name="barcode" placeholder="Optional" />
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Category</label>
              <select
                name="categoryId"
                className="block w-full rounded-md border border-line-strong px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-brand-600"
              >
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <FormField label="Brand" name="brand" placeholder="Optional" />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="Cost price *" name="costPrice" placeholder="0.00" type="number" step="0.01" />
            <FormField label="Selling price *" name="sellingPrice" placeholder="0.00" type="number" step="0.01" />
            <FormField label="Min stock level" name="minStockLevel" placeholder="0" type="number" defaultValue="0" />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Description</label>
            <textarea
              name="description"
              rows={2}
              className="block w-full rounded-md border border-line-strong px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-brand-600"
              placeholder="Optional"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Save product
            </button>
            <a
              href={`/app/${businessId}/products`}
              className="rounded-md border border-line-strong px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50"
            >
              Cancel
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}

function FormField({
  label, name, placeholder, type = "text", step, defaultValue,
}: {
  label: string; name: string; placeholder?: string; type?: string; step?: string; defaultValue?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink-700 mb-1">{label}</label>
      <input
        name={name}
        type={type}
        step={step}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="block w-full rounded-md border border-line-strong px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-brand-600"
      />
    </div>
  );
}
