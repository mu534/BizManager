import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { resolveContext } from "@server/auth/resolve-context";
import { listAccounts } from "@server/services/financial.service";
import { prisma } from "@server/db/prisma";
import { POSClient } from "./pos-client";

export const metadata: Metadata = { title: "Sell" };

export default async function SellPage({
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
  if (!branch) return <p className="text-sm text-gray-500">No active branch found.</p>;

  const [accounts, business] = await Promise.all([
    listAccounts(ctx),
    prisma.business.findUnique({ where: { id: businessId }, select: { currency: true } }),
  ]);

  const currency = business?.currency ?? "ETB";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">New Sale</h1>
        <Link href={`/app/${businessId}/sell/history`}
          className="text-sm text-gray-500 hover:text-gray-900">
          Sales history →
        </Link>
      </div>
      <POSClient
        businessId={businessId}
        branchId={branch.id}
        currency={currency}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, balance: a.currentBalance }))}
        canOverridePrice={ctx.role === "OWNER" || ctx.role === "MANAGER"}
      />
    </div>
  );
}
