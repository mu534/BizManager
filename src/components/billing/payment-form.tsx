"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@components/ui/button";
import { Field, Input, Select } from "@components/ui/field";
import { Alert } from "@components/ui/primitives";
import { formatMoney } from "@components/ui/format";

export interface PlanOption {
  code: string;
  displayName: string;
  currency: string;
  monthlyPriceMinor: number;
  yearlyPriceMinor: number;
  annualDiscountPercent: number;
}

interface ApiError {
  error?: { message?: string; details?: Record<string, string[] | undefined> };
}

export function PaymentForm({
  businessId,
  plans,
  defaultPlan,
}: {
  businessId: string;
  plans: PlanOption[];
  defaultPlan: string;
}) {
  const router = useRouter();
  const [planCode, setPlanCode] = useState(defaultPlan);
  const [period, setPeriod] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [done, setDone] = useState(false);

  const plan = plans.find((p) => p.code === planCode) ?? plans[0];
  const amount = plan ? (period === "MONTHLY" ? plan.monthlyPriceMinor : plan.yearlyPriceMinor) : 0;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    setFieldErrors({});
    try {
      const body = new FormData(e.currentTarget);
      body.set("planCode", planCode);
      body.set("billingPeriod", period);
      const res = await fetch(`/api/${businessId}/subscription/payments`, { method: "POST", body });
      if (res.ok) {
        setDone(true);
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as ApiError;
      setFieldErrors(data.error?.details ?? {});
      setMessage(data.error?.message ?? "We couldn't submit your payment. Please try again.");
    } catch {
      // Network failure: this is a connectivity problem, not a subscription problem.
      setMessage("You appear to be offline. Reconnect to submit your payment — nothing was sent.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Alert tone="success" title="Payment submitted">
        We received your receipt. An administrator will review it, usually within one business day. Your plan
        starts once it is approved.
      </Alert>
    );
  }
  if (!plan) {
    return <Alert tone="warning" title="No plans available">Plans are not available right now. Please contact support.</Alert>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {message && <Alert tone="danger" title="Couldn't submit">{message}</Alert>}

      <fieldset className="space-y-2">
        <legend className="text-[13px] font-medium text-ink-800">Plan</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {plans.map((p) => (
            <label
              key={p.code}
              className={`cursor-pointer rounded-control border px-3 py-2.5 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-600/40 ${
                p.code === planCode ? "border-brand-600 bg-brand-50" : "border-line-strong bg-surface hover:bg-ink-50"
              }`}
            >
              <input
                type="radio"
                name="plan-choice"
                value={p.code}
                checked={p.code === planCode}
                onChange={() => setPlanCode(p.code)}
                className="sr-only"
              />
              <span className="block font-semibold text-ink-900">{p.displayName}</span>
              <span className="block text-xs text-ink-500">{formatMoney(p.monthlyPriceMinor, p.currency)} / month</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-[13px] font-medium text-ink-800">Billing period</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["MONTHLY", "YEARLY"] as const).map((v) => (
            <label
              key={v}
              className={`cursor-pointer rounded-control border px-3 py-2.5 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-600/40 ${
                v === period ? "border-brand-600 bg-brand-50" : "border-line-strong bg-surface hover:bg-ink-50"
              }`}
            >
              <input type="radio" name="period-choice" value={v} checked={v === period} onChange={() => setPeriod(v)} className="sr-only" />
              <span className="block font-semibold text-ink-900">{v === "MONTHLY" ? "Monthly" : "Yearly"}</span>
              <span className="block text-xs text-ink-500">
                {v === "MONTHLY"
                  ? formatMoney(plan.monthlyPriceMinor, plan.currency)
                  : `${formatMoney(plan.yearlyPriceMinor, plan.currency)}${
                      plan.annualDiscountPercent > 0 ? ` · save ${plan.annualDiscountPercent}%` : ""
                    }`}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="rounded-control border border-line bg-ink-50 px-4 py-3 text-sm">
        <span className="text-ink-600">Amount to pay: </span>
        <strong className="text-ink-900">{formatMoney(amount, plan.currency)}</strong>
        <span className="text-ink-500"> — send exactly this amount, then fill in the details below.</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="How did you pay?" htmlFor="method" required error={fieldErrors.method?.[0]}>
          <Select id="method" name="method" defaultValue="TELEBIRR" required>
            <option value="TELEBIRR">Telebirr</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
          </Select>
        </Field>
        <Field
          label="Transaction reference"
          htmlFor="reference"
          required
          hint="Copy it from your Telebirr or bank receipt."
          error={fieldErrors.reference?.[0]}
        >
          <Input id="reference" name="reference" maxLength={64} autoComplete="off" required invalid={!!fieldErrors.reference} />
        </Field>
      </div>

      <Field
        label="Receipt or screenshot"
        htmlFor="receipt"
        required
        hint="JPG, PNG, WebP or PDF, up to 4 MB."
      >
        <input
          id="receipt"
          name="receipt"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          required
          className="block w-full text-sm text-ink-700 file:mr-3 file:h-10 file:rounded-control file:border file:border-line-strong file:bg-surface file:px-4 file:text-sm file:font-medium hover:file:bg-ink-50"
        />
      </Field>

      <Button type="submit" loading={busy}>
        {busy ? "Submitting…" : "Submit payment for review"}
      </Button>
    </form>
  );
}
