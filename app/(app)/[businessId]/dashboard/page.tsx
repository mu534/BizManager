import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { resolveContext } from "@server/auth/resolve-context";
import { getTodaysSummary } from "@server/services/sale.service";
import { listAccounts } from "@server/services/financial.service";
import { getInventoryReport } from "@server/services/report.service";
import { Money } from "@shared/money";
import { prisma } from "@server/db/prisma";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const ctx = await resolveContext(businessId).catch(() => null);
  if (!ctx) redirect("/sign-in");

  // Get the default branch for summary data.
  const branch = await prisma.branch.findFirst({
    where: { businessId, isDefault: true, status: "ACTIVE" },
  });
  if (!branch) redirect(`/app/${businessId}/settings`);

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { name: true, currency: true },
  });
  if (!business) redirect("/sign-in");

  const currency = business.currency;
  const branchCtx = { ...ctx, branchId: branch.id };

  const [summary, accounts, inventoryReport] = await Promise.all([
    getTodaysSummary(branchCtx, branch.id),
    listAccounts(ctx),
    getInventoryReport(branchCtx, branch.id),
  ]);

  const fmt = (n: number) => Money.format(n, currency);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{business.name}</h1>
          <p className="text-sm text-gray-500">Today's overview — {branch.name}</p>
        </div>
        <Link
          href={`/app/${businessId}/sell`}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          New Sale
        </Link>
      </div>

      {/* Today's stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Today's Revenue" value={fmt(summary.totalRevenue)} />
        <StatCard label="Sales Today" value={String(summary.salesCount)} />
        <StatCard label="Discounts Given" value={fmt(summary.totalDiscounts)} />
        <StatCard label="Low Stock Items" value={String(inventoryReport.lowStockCount)} warn={inventoryReport.lowStockCount > 0} />
      </div>

      {/* Account balances */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Account Balances</h2>
          <Link href={`/app/${businessId}/accounts`} className="text-sm text-blue-600 hover:underline">
            Manage accounts
          </Link>
        </div>
        {accounts.length === 0 ? (
          <p className="text-sm text-gray-500">No accounts yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {accounts.map((a) => (
              <div key={a.id} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide">{a.name}</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{fmt(a.currentBalance)}</p>
                <p className="text-xs text-gray-400 capitalize">{a.type.replace("_", " ").toLowerCase()}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Low stock alert */}
      {inventoryReport.lowStockCount > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-amber-800">
              {inventoryReport.lowStockCount} product{inventoryReport.lowStockCount > 1 ? "s are" : " is"} running low on stock
            </p>
            <Link
              href={`/app/${businessId}/inventory`}
              className="text-sm font-medium text-amber-700 hover:underline"
            >
              View inventory →
            </Link>
          </div>
          <ul className="mt-2 space-y-1">
            {inventoryReport.items
              .filter((i) => i.isLowStock)
              .slice(0, 5)
              .map((i) => (
                <li key={i.productId} className="text-sm text-amber-700">
                  {i.productName} — {i.quantity} {i.quantity === 1 ? "unit" : "units"} left
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* Inventory value */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-500">Total inventory value ({branch.name})</p>
        <p className="mt-1 text-xl font-semibold text-gray-900">{fmt(inventoryReport.totalValue)}</p>
        <p className="text-xs text-gray-400 mt-0.5">Based on cost price × current stock</p>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${warn ? "text-amber-600" : "text-gray-900"}`}>
        {value}
      </p>
    </div>
  );
}
