/** Where owners are told to send their subscription payment (set in the server environment). */

export interface BillingInstructions {
  telebirr: string | null;
  bank: string | null;
}

export function billingInstructions(env: Record<string, string | undefined> = process.env): BillingInstructions {
  const tNum = env.BILLING_TELEBIRR_NUMBER;
  const tName = env.BILLING_TELEBIRR_NAME;
  const bBank = env.BILLING_BANK_NAME;
  const bAcct = env.BILLING_BANK_ACCOUNT;
  const bName = env.BILLING_BANK_ACCOUNT_NAME;
  return {
    telebirr: tNum ? `${tNum}${tName ? ` (${tName})` : ""}` : null,
    bank: bBank && bAcct ? `${bBank} — ${bAcct}${bName ? ` (${bName})` : ""}` : null,
  };
}

/** True when owners have at least one place to send money. Without it nobody can subscribe. */
export function billingConfigured(env: Record<string, string | undefined> = process.env): boolean {
  const b = billingInstructions(env);
  return b.telebirr !== null || b.bank !== null;
}