import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolveContext } from "@server/auth/resolve-context";
import { listExpenseCategories } from "@server/services/expense.service";
import { listAccounts } from "@server/services/financial.service";
import { prisma } from "@server/db/prisma";
import { isAppError } from "@shared/errors";

export const metadata: Metadata = { title: "Record Expense" };

export default async function NewExpensePage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const ctx = await resolveContext(businessId).catch(() => null);
  if (!ctx) redirect("/sign-in");

  const branch = await prisma.branch.findFirst({ where: { businessId, isDefault: true, status: "ACTIVE" } });
  if (!branch) return <p className="text-sm text-gray-500">No active branch found.</p>;

  const [categories, accounts] = await Promise.all([
    listExpenseCategories(ctx),
    listAccounts(ctx),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  async function handleRecord(formData: FormData) {
    "use server";
    const ctxInner = await resolveContext(businessId).catch(() => null);
    if (!ctxInner) redirect("/sign-in");
    const branchInner = await prisma.branch.findFirst({ where: { businessId, isDefault: true, status: "ACTIVE" } });
    if (!branchInner) redirect(`/app/${businessId}/expenses`);

    const payload = {
      branchId: branchInner.id,
      categoryId: String(formData.get("categoryId")),
      accountId: String(formData.get("accountId")),
      amount: String(formData.get("amount")),
      description: (formData.get("description") as string) || undefined,
      expenseDate: String(formData.get("expenseDate")),
      notes: (formData.get("notes") as string) || undefined,
    };

    const { recordExpense } = await import("@server/services/expense.service");
    const { recordExpenseSchema } = await import("@shared/validation/expense.schema");
    const parsed = recordExpenseSchema.safeParse(payload);
    if (!parsed.success) redirect(`/app/${businessId}/expenses/new?error=validation`);

    try {
      await recordExpense(ctxInner, parsed.data);
    } catch (err) {
      if (isAppError(err)) redirect(`/app/${businessId}/expenses/new?error=${encodeURIComponent(err.message)}`);
      throw err;
    }
    redirect(`/app/${businessId}/expenses`);
  }

  return (
    <div className="max-w-lg space-y-6">
      <div className="flex items-center gap-3">
        <a href={`/app/${businessId}/expenses`} className="text-sm text-gray-500 hover:text-gray-900">← Expenses</a>
        <h1 className="text-xl font-semibold text-gray-900">Record expense</h1>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <form action={handleRecord} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
            <select name="categoryId" required
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="">Select category…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
            <input name="amount" type="number" step="0.01" required min="0.01"
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="0.00" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment account *</label>
            <select name="accountId" required
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
            <input name="expenseDate" type="date" required defaultValue={today}
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input name="description" type="text" placeholder="Optional"
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              Save expense
            </button>
            <a href={`/app/${businessId}/expenses`}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
