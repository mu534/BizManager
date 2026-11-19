/**
 * Pure rules for selling on credit ("ዱቤ") and collecting customer payments.
 * No I/O — everything here is unit-tested without a database.
 *
 * All amounts are integers in the smallest currency unit.
 */

export class CreditRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreditRuleError";
  }
}

export interface SalePaymentInput {
  accountId: string;
  amountMinor: number;
  verificationStatus: "VERIFIED" | "PENDING_VERIFICATION" | "FAILED";
}

export interface ResolvedSalePayments {
  payments: SalePaymentInput[];
  /** Part of the sale left unpaid and put on the customer's tab. */
  creditMinor: number;
}

/**
 * Decide how a sale total is settled: partly or fully paid now, and the rest on
 * the customer's tab. Payments plus credit must equal the sale total exactly.
 */
export function resolveSalePayments(input: {
  finalTotal: number;
  creditMinor: number;
  accountId?: string;
  payments?: SalePaymentInput[];
}): ResolvedSalePayments {
  const { finalTotal, creditMinor } = input;
  if (!Number.isInteger(creditMinor) || creditMinor < 0) {
    throw new CreditRuleError("Credit amount must be zero or a positive whole number.");
  }
  if (creditMinor > finalTotal) {
    throw new CreditRuleError("Credit amount cannot be more than the sale total.");
  }

  if (input.payments) {
    const sum = input.payments.reduce((s, p) => s + p.amountMinor, 0);
    if (sum + creditMinor !== finalTotal) {
      throw new CreditRuleError("Payment amounts must sum to the sale total");
    }
    return { payments: input.payments, creditMinor };
  }

  const paidNow = finalTotal - creditMinor;
  if (paidNow === 0) return { payments: [], creditMinor };
  if (!input.accountId) {
    throw new CreditRuleError("Choose the account that received the payment.");
  }
  return {
    payments: [{ accountId: input.accountId, amountMinor: paidNow, verificationStatus: "VERIFIED" }],
    creditMinor,
  };
}

export interface OpenDebt {
  id: string;
  outstandingMinor: number;
  createdAt: Date;
}

/**
 * Spread a customer payment over their open debts, oldest first.
 * A payment larger than the total owed is rejected, so no unusable balance is
 * created.
 */
export function allocateRepayment(
  debts: readonly OpenDebt[],
  amountMinor: number,
): { debtId: string; amountMinor: number }[] {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new CreditRuleError("Payment amount must be a positive whole number.");
  }
  const open = debts
    .filter((d) => d.outstandingMinor > 0)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  const totalOwed = open.reduce((s, d) => s + d.outstandingMinor, 0);
  if (amountMinor > totalOwed) {
    throw new CreditRuleError("This is more than the customer owes.");
  }
  const out: { debtId: string; amountMinor: number }[] = [];
  let left = amountMinor;
  for (const d of open) {
    if (left === 0) break;
    const part = Math.min(left, d.outstandingMinor);
    out.push({ debtId: d.id, amountMinor: part });
    left -= part;
  }
  return out;
}

/**
 * A return on a sale that still has unpaid credit first cancels that unpaid
 * amount; only the remainder is handed back from a money account.
 */
export function splitReturnRefund(
  totalRefundMinor: number,
  debtOutstandingMinor: number,
): { debtReductionMinor: number; cashRefundMinor: number } {
  const debtReductionMinor = Math.max(0, Math.min(totalRefundMinor, debtOutstandingMinor));
  return { debtReductionMinor, cashRefundMinor: totalRefundMinor - debtReductionMinor };
}