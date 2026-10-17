import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { resolveContext } from "@server/auth/resolve-context";
import { getSale } from "@server/services/sale.service";
import { listAccounts } from "@server/services/financial.service";
import { prisma } from "@server/db/prisma";
import { Money } from "@shared/money";
import { ReturnFormClient } from "./return-form-client";

export const metadata: Metadata = { title: "Process Return" };

export default async function ReturnPage({
  params,
}: {
  params: Promise<{ businessId: string; saleId: string }>;
}) {
  const { businessId, saleId } = await params;
  const ctx = await resolveContext(businessId).catch(() => null);
  if (!ctx) redirect("/sign-in");
  if (ctx.role === "STAFF") redirect(`/app/${businessId}/sell/history/${saleId}`);

  const [sale, accounts, business] = await Promise.all([
    getSale(ctx, saleId).catch(() => null),
    listAccounts(ctx),
    prisma.business.findUnique({ where: { id: businessId }, select: { currency: true } }),
  ]);
  if (!sale) redirect(`/app/${businessId}/sell/history`);
  if (sale.status === "RETURNED" || sale.status === "VOIDED") {
    redirect(`/app/${businessId}/sell/history/${saleId}`);
  }

  const currency = business?.currency ?? "ETB";

  // Compute already-returned quantities.
  const returnedQty = new Map<string, number>();
  for (const ret of sale.returns) {
    // The items are loaded via getSale's full include.
    const retWithItems = ret as typeof ret & { items: { saleItemId: string; quantity: number }[] };
    for (const ri of retWithItems.items ?? []) {
      returnedQty.set(ri.saleItemId, (returnedQty.get(ri.saleItemId) ?? 0) + ri.quantity);
    }
  }

  const returnableItems = sale.items
    .map((item) => ({
      id: item.id,
      productName: item.productName,
      productSku: item.productSku,
      originalQty: item.quantity,
      alreadyReturned: returnedQty.get(item.id) ?? 0,
      maxReturnable: item.quantity - (returnedQty.get(item.id) ?? 0),
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    }))
    .filter((i) => i.maxReturnable > 0);

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <Link href={`/app/${businessId}/sell/history/${saleId}`} className="text-sm text-gray-500 hover:text-gray-900">← Sale</Link>
        <h1 className="text-xl font-semibold text-gray-900">Process Return</h1>
      </div>
      <ReturnFormClient
        businessId={businessId}
        saleId={saleId}
        branchId={sale.branchId}
        currency={currency}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        returnableItems={returnableItems}
      />
    </div>
  );
}
