import "server-only";
import { prisma } from "@server/db/prisma";
import { appError } from "@shared/errors";
import { creditAccount, lockKey } from "@server/services/ledger";
import type { Tx } from "@server/services/ledger";
import { requireOwnerOrManager } from "@server/auth/permissions";
import { assertSubscriptionActive } from "@server/services/subscription.service";
import { CreditRuleError, allocateRepayment } from "@shared/credit-rules";
import type { TenantContext } from "@shared/types/auth.types";
import type {
  Customer,
  CustomerDebt,
  CustomerDebtRepayment,
  CustomerCredit,
  CustomerCreditApplication,
} from "@prisma/client";

// ─── createCustomer ────────────────────────────────────────

export async function createCustomer(
  ctx: TenantContext,
  input: { name: string; phone?: string; email?: string; notes?: string },
): Promise<Customer> {
  return prisma.customer.create({
    data: {
      businessId: ctx.businessId,
      name: input.name,
      phone: input.phone,
      email: input.email,
      notes: input.notes,
    },
  });
}

// ─── getCustomer ───────────────────────────────────────────

export async function getCustomer(
  ctx: TenantContext,
  customerId: string,
): Promise<Customer & { debts: CustomerDebt[]; credits: CustomerCredit[] }> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { debts: true, credits: true },
  });
  if (!customer || customer.businessId !== ctx.businessId) {
    throw appError.notFound("Customer not found");
  }
  return customer;
}

// ─── recordCustomerDebt ────────────────────────────────────

export async function recordCustomerDebt(
  tx: Tx,
  ctx: TenantContext,
  input: {
    customerId: string;
    saleId: string;
    amountMinor: number;
    operationId: string;
  },
): Promise<CustomerDebt> {
  const existing = await tx.customerDebt.findUnique({
    where: { operationId: input.operationId },
  });
  if (existing) return existing;

  const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
  if (!customer || customer.businessId !== ctx.businessId) {
    throw appError.notFound("Customer not found");
  }

  return tx.customerDebt.create({
    data: {
      businessId: ctx.businessId,
      customerId: input.customerId,
      saleId: input.saleId,
      originalAmountMinor: input.amountMinor,
      outstandingMinor: input.amountMinor,
      operationId: input.operationId,
    },
  });
}

// ─── recordRepayment ───────────────────────────────────────

export async function recordRepayment(
  ctx: TenantContext,
  input: {
    debtId: string;
    payments: Array<{
      amountMinor: number;
      paymentMethod: "CASH" | "TELEBIRR" | "BANK";
      verificationStatus: "VERIFIED" | "PENDING_VERIFICATION";
      operationId: string;
      notes?: string;
    }>;
  },
): Promise<{
  repayments: CustomerDebtRepayment[];
  overpaymentCredit: CustomerCredit | null;
  updatedDebt: CustomerDebt;
}> {
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, `debt:${input.debtId}`);

    const debt = await tx.customerDebt.findUnique({ where: { id: input.debtId } });
    if (!debt || debt.businessId !== ctx.businessId) {
      throw appError.notFound("Debt not found");
    }

    const repayments: CustomerDebtRepayment[] = [];
    for (const p of input.payments) {
      const existing = await tx.customerDebtRepayment.findUnique({
        where: { operationId: p.operationId },
      });
      if (existing) {
        repayments.push(existing);
        continue;
      }
      const repayment = await tx.customerDebtRepayment.create({
        data: {
          businessId: ctx.businessId,
          customerId: debt.customerId,
          debtId: debt.id,
          amountMinor: p.amountMinor,
          paymentMethod: p.paymentMethod,
          verificationStatus: p.verificationStatus,
          operationId: p.operationId,
          notes: p.notes,
        },
      });
      repayments.push(repayment);
    }

    // Compute verifiedSum from the STORED repayment rows (canonical amounts),
    // not from input.payments. This prevents a retry with a mutated amountMinor
    // from re-applying the wrong delta to outstandingMinor.
    const verifiedSum = repayments
      .filter((r) => r.verificationStatus === "VERIFIED")
      .reduce((s, r) => s + r.amountMinor, 0);

    let overpaymentCredit: CustomerCredit | null = null;
    let newOutstanding: number;

    if (verifiedSum <= debt.outstandingMinor) {
      newOutstanding = debt.outstandingMinor - verifiedSum;
    } else {
      const excess = verifiedSum - debt.outstandingMinor;
      newOutstanding = 0;
      const firstOpId =
        input.payments.find((p) => p.verificationStatus === "VERIFIED")?.operationId ?? "overpay";
      const overpayOpId = `${firstOpId}-overpay`;
      // Idempotency: a retry may re-enter this branch after repayment rows already
      // exist (taken via continue above). Guard with findUnique to avoid P2002.
      const existingCredit = await tx.customerCredit.findUnique({
        where: { operationId: overpayOpId },
      });
      overpaymentCredit = existingCredit ?? await tx.customerCredit.create({
        data: {
          businessId: ctx.businessId,
          customerId: debt.customerId,
          amountMinor: excess,
          reason: "Overpayment on debt repayment",
          sourceType: "OVERPAYMENT",
          sourceId: debt.id,
          operationId: overpayOpId,
        },
      });
    }

    const updatedDebt = await tx.customerDebt.update({
      where: { id: debt.id },
      data: { outstandingMinor: newOutstanding },
    });

    return { repayments, overpaymentCredit, updatedDebt };
  });
}

// ─── verifyRepayment ───────────────────────────────────────

export async function verifyRepayment(
  ctx: TenantContext,
  repaymentId: string,
  newStatus: "VERIFIED" | "FAILED",
): Promise<CustomerDebtRepayment> {
  return prisma.$transaction(async (tx) => {
    // Pre-lock read: only to discover which debt to lock on.
    // The authoritative businessId/status checks happen AFTER the lock.
    const preRead = await tx.customerDebtRepayment.findUnique({
      where: { id: repaymentId },
    });
    if (!preRead || preRead.businessId !== ctx.businessId) {
      throw appError.notFound("Repayment not found");
    }

    // Acquire the debt-scoped advisory lock BEFORE re-reading the repayment.
    // This eliminates the TOCTOU window where two concurrent calls both see
    // PENDING_VERIFICATION before either has taken the lock.
    await lockKey(tx, `debt:${preRead.debtId}`);

    // Re-read repayment under the lock — now the status check is race-safe.
    const repayment = await tx.customerDebtRepayment.findUnique({
      where: { id: repaymentId },
    });
    if (!repayment || repayment.businessId !== ctx.businessId) {
      throw appError.notFound("Repayment not found");
    }
    if (repayment.verificationStatus !== "PENDING_VERIFICATION") {
      throw appError.validationError("Repayment is not pending verification");
    }

    if (newStatus === "VERIFIED") {
      const debt = await tx.customerDebt.findUnique({ where: { id: repayment.debtId } });
      if (!debt || debt.businessId !== ctx.businessId) throw appError.notFound("Debt not found");

      let newOutstanding: number;
      if (repayment.amountMinor <= debt.outstandingMinor) {
        newOutstanding = debt.outstandingMinor - repayment.amountMinor;
      } else {
        const excess = repayment.amountMinor - debt.outstandingMinor;
        newOutstanding = 0;
        const verifyOverpayOpId = `${repaymentId}-verify-overpay`;
        // Idempotency: on a retry the repayment row already exists but this
        // transaction re-enters the overpayment branch. Guard with findUnique
        // to avoid a P2002 on the unique operationId index.
        const existingCredit = await tx.customerCredit.findUnique({
          where: { operationId: verifyOverpayOpId },
        });
        if (!existingCredit) {
          await tx.customerCredit.create({
            data: {
              businessId: ctx.businessId,
              customerId: repayment.customerId,
              amountMinor: excess,
              reason: "Overpayment on verification",
              sourceType: "OVERPAYMENT",
              sourceId: debt.id,
              operationId: verifyOverpayOpId,
            },
          });
        }
      }

      await tx.customerDebt.update({
        where: { id: repayment.debtId },
        data: { outstandingMinor: newOutstanding },
      });
    }

    return tx.customerDebtRepayment.update({
      where: { id: repaymentId },
      data: { verificationStatus: newStatus },
    });
  });
}

// ─── createCustomerCredit ──────────────────────────────────

export async function createCustomerCredit(
  tx: Tx,
  ctx: TenantContext,
  input: {
    customerId: string;
    amountMinor: number;
    reason: string;
    sourceType: "OVERPAYMENT" | "RETURN" | "MANUAL";
    sourceId?: string;
    operationId: string;
  },
): Promise<CustomerCredit> {
  const existing = await tx.customerCredit.findUnique({
    where: { operationId: input.operationId },
  });
  if (existing) return existing;

  return tx.customerCredit.create({
    data: {
      businessId: ctx.businessId,
      customerId: input.customerId,
      amountMinor: input.amountMinor,
      reason: input.reason,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      operationId: input.operationId,
    },
  });
}

// ─── applyCustomerCredit ───────────────────────────────────

export async function applyCustomerCredit(
  ctx: TenantContext,
  input: {
    customerId: string;
    creditId: string;
    saleId: string;
    amountMinor: number;
    approvedById: string;
    operationId: string;
  },
): Promise<CustomerCreditApplication> {
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, `customer-credit:${input.creditId}`);

    const credit = await tx.customerCredit.findUnique({ where: { id: input.creditId } });
    if (!credit || credit.businessId !== ctx.businessId) {
      throw appError.notFound("Credit not found");
    }

    // Compute remaining balance = original amount - sum of applications
    const applications = await tx.customerCreditApplication.findMany({
      where: { creditId: input.creditId },
    });
    const totalApplied = applications.reduce((s, a) => s + a.amountMinor, 0);
    const remaining = credit.amountMinor - totalApplied;
    if (input.amountMinor > remaining) {
      throw appError.validationError("Insufficient credit balance");
    }

    const existing = await tx.customerCreditApplication.findUnique({
      where: { operationId: input.operationId },
    });
    if (existing) return existing;

    return tx.customerCreditApplication.create({
      data: {
        businessId: ctx.businessId,
        customerId: input.customerId,
        creditId: input.creditId,
        saleId: input.saleId,
        amountMinor: input.amountMinor,
        approvedById: input.approvedById,
        operationId: input.operationId,
      },
    });
  });
}


// ─── Customer tab: list, detail, receiving payments ─────────

export interface CustomerListItem {
  id: string;
  name: string;
  phone: string | null;
  owedMinor: number;
  openDebts: number;
}

/** Customers with how much each one currently owes. Owner/manager only. */
export async function listCustomers(
  ctx: TenantContext,
  opts: { search?: string } = {},
): Promise<CustomerListItem[]> {
  requireOwnerOrManager(ctx);
  const q = opts.search?.trim();
  const rows = await prisma.customer.findMany({
    where: {
      businessId: ctx.businessId,
      ...(q
        ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] }
        : {}),
    },
    orderBy: { name: "asc" },
    take: 500,
    include: { debts: { where: { outstandingMinor: { gt: 0 } }, select: { outstandingMinor: true } } },
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    owedMinor: c.debts.reduce((sum, d) => sum + d.outstandingMinor, 0),
    openDebts: c.debts.length,
  }));
}

export interface CustomerDebtView {
  id: string;
  saleId: string;
  receiptNumber: string | null;
  originalMinor: number;
  outstandingMinor: number;
  /** Cancelled by returns rather than paid. */
  returnedMinor: number;
  createdAt: Date;
}
export interface CustomerRepaymentView {
  id: string;
  amountMinor: number;
  paymentMethod: string;
  notes: string | null;
  createdAt: Date;
}
export interface CustomerDetail {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  owedMinor: number;
  debts: CustomerDebtView[];
  repayments: CustomerRepaymentView[];
}

export async function getCustomerDetail(ctx: TenantContext, customerId: string): Promise<CustomerDetail> {
  requireOwnerOrManager(ctx);
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      debts: { orderBy: { createdAt: "desc" }, take: 200, include: { repayments: true } },
      debtRepayments: { where: { verificationStatus: "VERIFIED" }, orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!customer || customer.businessId !== ctx.businessId) throw appError.notFound("Customer not found");

  const sales = await prisma.sale.findMany({
    where: { id: { in: customer.debts.map((d) => d.saleId) }, branch: { businessId: ctx.businessId } },
    select: { id: true, receiptNumber: true },
  });
  const receipt = new Map(sales.map((x) => [x.id, x.receiptNumber] as const));

  const debts: CustomerDebtView[] = customer.debts.map((d) => {
    const paid = d.repayments
      .filter((r) => r.verificationStatus === "VERIFIED")
      .reduce((sum, r) => sum + r.amountMinor, 0);
    return {
      id: d.id,
      saleId: d.saleId,
      receiptNumber: receipt.get(d.saleId) ?? null,
      originalMinor: d.originalAmountMinor,
      outstandingMinor: d.outstandingMinor,
      returnedMinor: Math.max(0, d.originalAmountMinor - d.outstandingMinor - paid),
      createdAt: d.createdAt,
    };
  });
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    notes: customer.notes,
    owedMinor: debts.reduce((sum, d) => sum + d.outstandingMinor, 0),
    debts,
    repayments: customer.debtRepayments.map((r) => ({
      id: r.id,
      amountMinor: r.amountMinor,
      paymentMethod: r.paymentMethod,
      notes: r.notes,
      createdAt: r.createdAt,
    })),
  };
}

/**
 * Customer pays towards what they owe. The money lands in the chosen account
 * (one ledger entry), and is applied to their oldest unpaid sales first.
 * Idempotent on operationId. Paying more than is owed is rejected.
 */
export async function receiveCustomerPayment(
  ctx: TenantContext,
  input: { customerId: string; accountId: string; amountMinor: number; operationId: string; notes?: string },
): Promise<{ appliedMinor: number; remainingMinor: number }> {
  requireOwnerOrManager(ctx);
  await assertSubscriptionActive(ctx);

  return prisma.$transaction(async (tx) => {
    await lockKey(tx, `customer-payment:${input.customerId}`);

    const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
    if (!customer || customer.businessId !== ctx.businessId) throw appError.notFound("Customer not found");

    const account = await tx.financialAccount.findUnique({ where: { id: input.accountId } });
    if (!account || account.businessId !== ctx.businessId || account.status !== "ACTIVE") {
      throw appError.invalidAccount("Payment account not found or inactive.");
    }
    const method =
      account.type === "CASH" ? "CASH" : account.type === "MOBILE_MONEY" ? "TELEBIRR" : account.type === "BANK" ? "BANK" : null;
    if (!method) throw appError.validationError("Choose a cash, mobile money or bank account.");

    // Retry of a payment that already went through: report it, never apply twice.
    const prior = await tx.customerDebtRepayment.findMany({
      where: { operationId: { startsWith: `${input.operationId}:` }, businessId: ctx.businessId },
    });
    if (prior.length > 0) {
      const open = await tx.customerDebt.aggregate({
        where: { customerId: customer.id, outstandingMinor: { gt: 0 } },
        _sum: { outstandingMinor: true },
      });
      return { appliedMinor: prior.reduce((sum, r) => sum + r.amountMinor, 0), remainingMinor: open._sum.outstandingMinor ?? 0 };
    }

    const debts = await tx.customerDebt.findMany({
      where: { customerId: customer.id, businessId: ctx.businessId, outstandingMinor: { gt: 0 } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    for (const d of debts) await lockKey(tx, `debt:${d.id}`);
    // Re-read under the locks so a concurrent payment or return is seen.
    const fresh = await tx.customerDebt.findMany({
      where: { id: { in: debts.map((d) => d.id) }, outstandingMinor: { gt: 0 } },
    });

    let plan;
    try {
      plan = allocateRepayment(fresh, input.amountMinor);
    } catch (err) {
      if (err instanceof CreditRuleError) throw appError.validationError(err.message);
      throw err;
    }

    for (const part of plan) {
      await tx.customerDebtRepayment.create({
        data: {
          businessId: ctx.businessId,
          customerId: customer.id,
          debtId: part.debtId,
          amountMinor: part.amountMinor,
          paymentMethod: method,
          verificationStatus: "VERIFIED",
          operationId: `${input.operationId}:${part.debtId}`,
          notes: input.notes,
        },
      });
      await tx.customerDebt.update({
        where: { id: part.debtId },
        data: { outstandingMinor: { decrement: part.amountMinor } },
      });
    }

    await creditAccount(tx, account.id, input.amountMinor, "DEBT_REPAYMENT", {
      referenceId: customer.id,
      referenceType: "Customer",
      notes: customer.name,
    });

    const owed = fresh.reduce((sum, d) => sum + d.outstandingMinor, 0);
    return { appliedMinor: input.amountMinor, remainingMinor: owed - input.amountMinor };
  });
}