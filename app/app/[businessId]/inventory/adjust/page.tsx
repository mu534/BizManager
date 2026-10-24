import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolveContext } from "@server/auth/resolve-context";
import { prisma } from "@server/db/prisma";
import { getCurrentBranch } from "@server/branch/current-branch";
import { AccessDenied } from "@components/layout/states";
import { PageHeader, Card } from "@components/ui/primitives";
import { StockFormClient } from "@components/forms/StockFormClient";
import { UserRole } from "@shared/types/auth.types";

export const metadata: Metadata = { title: "Adjust stock" };
// Reads session + business-scoped DB data on every request — cannot prerender.
export const instant = false;

export default async function AdjustStockPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ productId?: string }>;
}) {
  const { businessId } = await params;
  const sp = await searchParams;
  const ctx = await resolveContext(businessId).catch(() => null);
  if (!ctx) redirect("/sign-in");
  // Stock changes are owner/manager work (the service enforces this too).
  if (ctx.role === UserRole.STAFF) return <AccessDenied businessId={businessId} what="stock adjustments" />;

  const [products, branch] = await Promise.all([
    prisma.product.findMany({
      where: { businessId, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, sku: true },
    }),
    getCurrentBranch(ctx),
  ]);
  if (!branch) return <p className="text-sm text-ink-500">No active branch found.</p>;

  return (
    <div className="max-w-xl space-y-6">
      <PageHeader
        title="Adjust stock"
        description="Record goods received, count corrections and damaged stock. Works without internet — changes sync when you are back online."
      />
      <Card>
        <div className="p-4 sm:p-6">
          <StockFormClient businessId={businessId} branchId={branch.id} products={products} initialProductId={sp.productId} />
        </div>
      </Card>
    </div>
  );
}
