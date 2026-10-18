import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolveContext } from "@server/auth/resolve-context";
import { listExpenseCategories } from "@server/services/expense.service";
import { listAccounts } from "@server/services/financial.service";
import { prisma } from "@server/db/prisma";
import { ExpenseFormClient } from "@components/forms/ExpenseFormClient";

export const metadata: Metadata = { title: "Record Expense" };


// Reads session + business-scoped DB data on every request — cannot prerender.
export const instant = false;

export default async function NewExpensePage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const ctx = await resolveContext(businessId).catch(() => null);
  if (!ctx) redirect("/sign-in");

  const branch = await prisma.branch.findFirst({
    where: { businessId, isDefault: true, status: "ACTIVE" },
  });
  if (!branch)
    return <p className="text-sm text-gray-500">No active branch found.</p>;

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { currency: true },
  });
  if (!business)
    return <p className="text-sm text-gray-500">Business not found.</p>;

  const [categories, accounts] = await Promise.all([
    listExpenseCategories(ctx),
    listAccounts(ctx),
  ]);

  return (
    <div className="max-w-lg space-y-6">
      <div className="flex items-center gap-3">
        <a
          href={`/app/${businessId}/expenses`}
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          ← Expenses
        </a>
        <h1 className="text-xl font-semibold text-gray-900">Record expense</h1>
      </div>

      <ExpenseFormClient
        businessId={businessId}
        branchId={branch.id}
        categories={categories}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        currency={business.currency}
      />
    </div>
  );
}
