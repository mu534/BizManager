import type { Metadata } from "next";
import { adminPageGuard } from "@server/auth/require-admin-page";
import { listAllPlans } from "@server/services/platform-admin.service";
import { Alert, Card, CardHeader, PageHeader } from "@components/ui/primitives";
import { PLANS, isPlanCode, priceForPeriod } from "@shared/plans";
import { formatMoney } from "@components/ui/format";
import { PlanForm } from "./plan-form";

export const metadata: Metadata = { title: "Plans & pricing" };
export const instant = false;

export default async function PlansPage() {
  const admin = await adminPageGuard();
  const plans = await listAllPlans();
  const canEdit = admin.role === "SUPER_ADMIN";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plans & pricing"
        description="Prices and the yearly discount are editable here. Which features each plan includes is defined in code and changes only with a release."
      />
      {!canEdit && <Alert tone="info">Only a super administrator can change pricing.</Alert>}
      {plans.map((p) => {
        const features = isPlanCode(p.name) ? [...PLANS[p.name].features].map((f) => f.replace(/_/g, " ").toLowerCase()) : [];
        const yearly = formatMoney(priceForPeriod({ monthlyPriceMinor: p.monthlyPriceMinor, annualDiscountBps: p.annualDiscountBps }, "YEARLY"), p.currency);
        return (
          <Card key={p.id}>
            <CardHeader title={p.displayName} description={`Yearly total at current settings: ${yearly}. Includes: ${features.join(", ") || "—"}.`} />
            <div className="px-4 py-4 sm:px-5">
              <PlanForm
                planId={p.id}
                name={p.displayName}
                priceMajor={(p.monthlyPriceMinor / 100).toFixed(2)}
                discountPercent={(p.annualDiscountBps / 100).toString()}
                isActive={p.isActive}
                canEdit={canEdit}
              />
            </div>
          </Card>
        );
      })}
    </div>
  );
}
