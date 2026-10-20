import { connection } from "next/server";
import { getDictionary, format, type Locale } from "@shared/i18n";
import { PLAN_BASE, PLAN_FEATURE_LINES } from "@shared/plan-marketing";
import { PLAN_CODES, type PlanCode } from "@shared/plans";
import { getPublicPlans, type PublicPlan } from "@server/services/public-pricing.service";
import { PricingClient, type PricingPlanView } from "./pricing-client";

/**
 * Streams in behind <Suspense>: the rest of the page is static, prices come from
 * the same database rows the payment flow charges from. If prices cannot be
 * loaded we say so instead of showing stale or invented numbers.
 */
export async function PricingSection({ locale }: { locale: Locale }) {
  await connection(); // request-time data; keep out of the static shell
  const t = getDictionary(locale).pricing;

  let plans: PublicPlan[] | null = null;
  try {
    plans = await getPublicPlans();
  } catch (err) {
    console.error("[pricing] could not load plans", err);
  }
  const byCode = new Map<PlanCode, PublicPlan>((plans ?? []).map((p) => [p.code, p] as const));

  const views: PricingPlanView[] = [];
  for (const code of PLAN_CODES) {
    const db = byCode.get(code);
    if (plans && !db) continue; // plan is switched off by an administrator
    const base = PLAN_BASE[code];
    views.push({
      code,
      name: db?.displayName ?? code.charAt(0) + code.slice(1).toLowerCase(),
      tagline: t.plans[code].tagline,
      currency: db?.currency ?? null,
      monthlyMinor: db?.monthlyMinor ?? null,
      yearlyMinor: db?.yearlyMinor ?? null,
      savePercent: db?.yearlySavingsPercent ?? 0,
      includesLabel: base ? format(t.includesPrev, { plan: byCode.get(base)?.displayName ?? base }) : null,
      lines: PLAN_FEATURE_LINES[code].map((l) => ({ text: t.features[l.key], soon: l.availability === "soon" })),
      featured: code === "PRO",
    });
  }

  return (
    <>
      {!plans && <p className="mb-6 text-center text-sm text-warning-700">{t.loadError}</p>}
      <PricingClient
        plans={views}
        signUpHref={`/sign-up?lang=${locale}`}
        labels={{
          monthly: t.monthly,
          yearly: t.yearly,
          perMonth: t.perMonth,
          perYear: t.perYear,
          save: t.save,
          cta: t.cta,
          soon: t.soon,
          priceUnavailable: t.priceUnavailable,
        }}
      />
      <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-ink-500">{t.manualNote}</p>
    </>
  );
}

export function PricingSkeleton() {
  return (
    <div aria-hidden="true" className="grid gap-5 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-96 animate-pulse rounded-card border border-line bg-ink-50" />
      ))}
    </div>
  );
}
