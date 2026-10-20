import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolveContext } from "@server/auth/resolve-context";
import { requireOwner } from "@server/auth/permissions";
import { getSubscriptionSummary } from "@server/services/subscription.service";
import { listBusinessPayments, listPurchasablePlans } from "@server/services/subscription-payment.service";
import { PaymentForm } from "@components/billing/payment-form";
import { Alert, Badge, Card, CardHeader, PageHeader, Table, TableWrap, Td, Th, type Tone } from "@components/ui/primitives";
import { formatDate, formatMoney } from "@components/ui/format";
import { PLANS, isPlanCode } from "@shared/plans";

export const metadata: Metadata = { title: "Subscription" };

// Reads session + business-scoped DB data on every request — cannot prerender.
export const instant = false;

const STATE_LABEL: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: "Active", tone: "success" },
  GRACE: { label: "Grace period", tone: "warning" },
  READ_ONLY: { label: "Expired — read-only", tone: "danger" },
  NONE: { label: "No plan yet", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
  SUSPENDED: { label: "Suspended", tone: "danger" },
};
const PAYMENT_TONE: Record<string, Tone> = { PENDING: "warning", APPROVED: "success", REJECTED: "danger" };
const PAYMENT_LABEL: Record<string, string> = { PENDING: "Awaiting review", APPROVED: "Approved", REJECTED: "Rejected" };

function instructions(): { telebirr: string | null; bank: string | null } {
  const tNum = process.env.BILLING_TELEBIRR_NUMBER;
  const tName = process.env.BILLING_TELEBIRR_NAME;
  const bBank = process.env.BILLING_BANK_NAME;
  const bAcct = process.env.BILLING_BANK_ACCOUNT;
  const bName = process.env.BILLING_BANK_ACCOUNT_NAME;
  return {
    telebirr: tNum ? `${tNum}${tName ? ` (${tName})` : ""}` : null,
    bank: bBank && bAcct ? `${bBank} — ${bAcct}${bName ? ` (${bName})` : ""}` : null,
  };
}

export default async function SubscriptionPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const ctx = await resolveContext(businessId).catch(() => null);
  if (!ctx) redirect("/sign-in");
  requireOwner(ctx);

  const [summary, plans, payments] = await Promise.all([
    getSubscriptionSummary(ctx),
    listPurchasablePlans(),
    listBusinessPayments(ctx),
  ]);
  const state = STATE_LABEL[summary.state] ?? { label: "Unknown", tone: "neutral" as Tone };
  const pending = payments.find((p) => p.status === "PENDING");
  const pay = instructions();
  const planNames = new Map(plans.map((p) => [p.id, p.displayName] as const));

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Subscription"
        description="Your plan, renewal date and payments. Payments are verified manually by the BizManager team."
      />

      <Card>
        <CardHeader title="Current plan" action={<Badge tone={state.tone}>{state.label}</Badge>} />
        <dl className="grid gap-4 px-4 py-4 text-sm sm:grid-cols-3 sm:px-5">
          <div>
            <dt className="text-ink-500">Plan</dt>
            <dd className="font-semibold text-ink-900">{summary.planDisplayName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-ink-500">Billing</dt>
            <dd className="font-semibold text-ink-900">
              {summary.billingPeriod === "YEARLY" ? "Yearly" : summary.billingPeriod === "MONTHLY" ? "Monthly" : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-ink-500">{summary.state === "GRACE" ? "Grace ends" : "Period ends"}</dt>
            <dd className="font-semibold text-ink-900">
              {summary.state === "GRACE" && summary.graceEndsAt
                ? formatDate(summary.graceEndsAt)
                : summary.periodEndsAt
                  ? formatDate(summary.periodEndsAt)
                  : "—"}
            </dd>
          </div>
        </dl>
        {summary.planCode && isPlanCode(summary.planCode) && (
          <p className="border-t border-line px-4 py-3 text-xs text-ink-500 sm:px-5">
            Included: {[...PLANS[summary.planCode].features].map((f) => f.replace(/_/g, " ").toLowerCase()).join(", ")}.
          </p>
        )}
      </Card>

      {summary.state === "GRACE" && (
        <Alert tone="warning" title="Renew within the grace period">
          Recording continues for {summary.daysRemaining} more day{summary.daysRemaining === 1 ? "" : "s"}. After that
          you keep read-only access and data export.
        </Alert>
      )}

      {pending ? (
        <Alert tone="info" title="Payment awaiting review">
          Your {formatMoney(pending.amountMinor, pending.currency)} payment (reference {pending.reference}) was
          submitted on {formatDate(pending.createdAt)}. You can submit another one after it has been reviewed.
        </Alert>
      ) : (
        <Card>
          <CardHeader
            title={summary.canWrite ? "Renew or change plan" : "Choose a plan and pay"}
            description="Pay by Telebirr or bank transfer, then upload your receipt."
          />
          <div className="space-y-5 px-4 py-4 sm:px-5">
            <div className="rounded-control border border-line bg-ink-50 px-4 py-3 text-sm">
              <p className="font-medium text-ink-800">Send your payment to</p>
              {pay.telebirr || pay.bank ? (
                <ul className="mt-1 space-y-0.5 text-ink-700">
                  {pay.telebirr && <li>Telebirr: {pay.telebirr}</li>}
                  {pay.bank && <li>Bank: {pay.bank}</li>}
                </ul>
              ) : (
                <p className="mt-1 text-warning-700">
                  Payment details have not been configured yet. Please contact support before paying.
                </p>
              )}
            </div>
            <PaymentForm
              businessId={businessId}
              defaultPlan={summary.planCode ?? plans[0]?.code ?? "BASIC"}
              plans={plans.map((p) => ({
                code: p.code,
                displayName: p.displayName,
                currency: p.currency,
                monthlyPriceMinor: p.monthlyPriceMinor,
                yearlyPriceMinor: p.yearlyPriceMinor,
                annualDiscountPercent: p.annualDiscountBps / 100,
              }))}
            />
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="Payment history" />
        {payments.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-500 sm:px-5">No payments submitted yet.</p>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Submitted</Th>
                  <Th>Plan</Th>
                  <Th align="right">Amount</Th>
                  <Th>Reference</Th>
                  <Th>Status</Th>
                  <Th>Receipt</Th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <Td>{formatDate(p.createdAt)}</Td>
                    <Td>
                      {planNames.get(p.planId) ?? "—"} · {p.billingPeriod === "YEARLY" ? "Yearly" : "Monthly"}
                    </Td>
                    <Td align="right">{formatMoney(p.amountMinor, p.currency)}</Td>
                    <Td>{p.reference}</Td>
                    <Td>
                      <Badge tone={PAYMENT_TONE[p.status] ?? "neutral"}>{PAYMENT_LABEL[p.status] ?? p.status}</Badge>
                      {p.status === "REJECTED" && p.rejectionReason && (
                        <p className="mt-1 max-w-xs text-xs text-danger-700">Reason: {p.rejectionReason}</p>
                      )}
                    </Td>
                    <Td>
                      <a
                        href={`/api/payments/${p.id}/evidence`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-700 underline"
                      >
                        View
                      </a>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
