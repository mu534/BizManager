import Link from "next/link";
import { Card } from "@components/ui/primitives";
import { planFirstSteps, type PaymentStatus, type StepState } from "@shared/onboarding-rules";

const MARK: Record<StepState, string> = {
  done: "bg-success-600 text-white",
  current: "bg-brand-600 text-white",
  attention: "bg-warning-600 text-white",
  upcoming: "bg-ink-200 text-ink-600",
};

/**
 * Dashboard card for a shop that has no plan yet. Replaces the "add products /
 * make a sale" checklist, because recording is paused until a payment is approved.
 */
export function PlanFirstSteps({
  businessId,
  isOwner,
  latestPayment,
}: {
  businessId: string;
  isOwner: boolean;
  latestPayment: PaymentStatus | null;
}) {
  const s = planFirstSteps(latestPayment);
  const planHref = `/app/${businessId}/settings/subscription`;

  const steps: { n: number; title: string; body: string; state: StepState; href?: string }[] = [
    {
      n: 1,
      title: latestPayment === "REJECTED" ? "Pay again" : "Choose a plan and pay",
      body:
        latestPayment === "REJECTED"
          ? "Your last payment could not be approved. Check the reason and submit it again."
          : "Pay by Telebirr or bank transfer, then upload your receipt.",
      state: s.choose,
      href: isOwner ? planHref : undefined,
    },
    {
      n: 2,
      title: "We check your payment",
      body: "The BizManager team verifies it by hand, usually within one business day.",
      state: s.review,
    },
    {
      n: 3,
      title: "Start recording",
      body: "Add products, record opening stock and make your first sale.",
      state: s.record,
    },
  ];

  return (
    <Card className="mb-5 overflow-hidden">
      <div className="bg-brand-gradient bg-grid-light p-5 text-white">
        <h2 className="text-lg font-semibold">
          {latestPayment === "PENDING" ? "Your payment is being checked" : "Choose a plan to start recording"}
        </h2>
        <p className="mt-1 max-w-xl text-sm text-white/85">
          {isOwner
            ? "You can look around and view your data now. Recording sales, products, expenses and stock turns on when your payment is approved."
            : "The business owner needs to choose a plan before sales, products and expenses can be recorded."}
        </p>
      </div>
      <ol className="grid gap-px bg-line sm:grid-cols-3">
        {steps.map((st) => {
          const inner = (
            <>
              <span className="flex items-center gap-2 text-xs font-semibold text-ink-600">
                <span aria-hidden="true" className={`grid size-5 place-items-center rounded-full text-[11px] ${MARK[st.state]}`}>
                  {st.state === "done" ? "✓" : st.n}
                </span>
                Step {st.n}
                {st.state === "current" && <span className="text-brand-700">· now</span>}
                {st.state === "attention" && <span className="text-warning-700">· needs you</span>}
              </span>
              <p className="mt-1 font-semibold text-ink-900">{st.title}</p>
              <p className="mt-0.5 text-[13px] text-ink-500">{st.body}</p>
            </>
          );
          return (
            <li key={st.n} className="bg-surface p-4">
              {st.href && (st.state === "current" || st.state === "attention") ? (
                <Link href={st.href} className="group block [&_p:first-of-type]:group-hover:underline">
                  {inner}
                </Link>
              ) : (
                <div>{inner}</div>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}