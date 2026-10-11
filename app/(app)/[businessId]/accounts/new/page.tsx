import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolveContext } from "@server/auth/resolve-context";
import { createAccount } from "@server/services/financial.service";
import { createAccountSchema } from "@shared/validation/financial.schema";
import { isAppError } from "@shared/errors";

export const metadata: Metadata = { title: "Add Account" };

export default async function NewAccountPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const ctx = await resolveContext(businessId).catch(() => null);
  if (!ctx) redirect("/sign-in");

  async function handleCreate(formData: FormData) {
    "use server";
    const ctxInner = await resolveContext(businessId).catch(() => null);
    if (!ctxInner) redirect("/sign-in");
    const raw = {
      name: formData.get("name"),
      type: formData.get("type"),
      openingBalance: formData.get("openingBalance") || "0",
      isDefault: formData.get("isDefault") === "true",
    };
    const parsed = createAccountSchema.safeParse(raw);
    if (!parsed.success) redirect(`/app/${businessId}/accounts/new?error=validation`);
    try {
      await createAccount(ctxInner, parsed.data);
    } catch (err) {
      if (isAppError(err)) redirect(`/app/${businessId}/accounts/new?error=${encodeURIComponent(err.message)}`);
      throw err;
    }
    redirect(`/app/${businessId}/accounts`);
  }

  return (
    <div className="max-w-md space-y-6">
      <div className="flex items-center gap-3">
        <a href={`/app/${businessId}/accounts`} className="text-sm text-gray-500 hover:text-gray-900">← Accounts</a>
        <h1 className="text-xl font-semibold text-gray-900">Add account</h1>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <form action={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Account name *</label>
            <input name="name" required
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="e.g. Cash Till, CBE Account" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Account type *</label>
            <select name="type" required
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="CASH">Cash</option>
              <option value="MOBILE_MONEY">Mobile Money (Telebirr, M-Pesa…)</option>
              <option value="BANK">Bank Account</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Opening balance</label>
            <input name="openingBalance" type="number" step="0.01" min="0" defaultValue="0"
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              Create account
            </button>
            <a href={`/app/${businessId}/accounts`}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
