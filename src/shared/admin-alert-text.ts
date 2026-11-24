import { Money } from "./money";

export interface PaymentAlertInput {
  businessName: string;
  planName: string;
  billingPeriod: "MONTHLY" | "YEARLY";
  amountMinor: number;
  currency: string;
  method: string;
  reference: string;
  /** Public site origin, without a trailing slash. */
  appUrl: string;
}

const METHOD: Record<string, string> = { TELEBIRR: "Telebirr", BANK_TRANSFER: "Bank transfer" };

/** Plain-text message for the admin team. Never includes the receipt image or any user contact details. */
export function buildPaymentAlertText(p: PaymentAlertInput): string {
  return [
    "New payment to review",
    `${p.businessName} — ${p.planName} (${p.billingPeriod === "YEARLY" ? "yearly" : "monthly"})`,
    `${Money.format(p.amountMinor, p.currency)} via ${METHOD[p.method] ?? p.method}`,
    `Reference: ${p.reference}`,
    `Review: ${p.appUrl}/admin/payments`,
  ].join("\n");
}