import "server-only";
import { prisma } from "@server/db/prisma";
import { appError } from "@shared/errors";
import { lockKey } from "@server/services/ledger";
import type { Tx } from "@server/services/ledger";
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

    const verifiedSum = input.payments
      .filter((p) => p.verificationStatus === "VERIFIED")
      .reduce((s, p) => s + p.amountMinor, 0);

    let overpaymentCredit: CustomerCredit | null = null;
    let newOutstanding: number;

    if (verifiedSum <= debt.outstandingMinor) {
      newOutstanding = debt.outstandingMinor - verifiedSum;
    } else {
      const excess = verifiedSum - debt.outstandingMinor;
      newOutstanding = 0;
      const firstOpId =
        input.payments.find((p) => p.verificationStatus === "VERIFIED")?.operationId ?? "overpay";
      overpaymentCredit = await tx.customerCredit.create({
        data: {
          businessId: ctx.businessId,
          customerId: debt.customerId,
          amountMinor: excess,
          reason: "Overpayment on debt repayment",
          sourceType: "OVERPAYMENT",
          sourceId: debt.id,
          operationId: `${firstOpId}-overpay`,
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
    const repayment = await tx.customerDebtRepayment.findUnique({
      where: { id: repaymentId },
    });
    if (!repayment || repayment.businessId !== ctx.businessId) {
      throw appError.notFound("Repayment not found");
    }
    if (repayment.verificationStatus !== "PENDING_VERIFICATION") {
      throw appError.validationError("Repayment is not pending verification");
    }

    await lockKey(tx, `debt:${repayment.debtId}`);

    if (newStatus === "VERIFIED") {
      const debt = await tx.customerDebt.findUnique({ where: { id: repayment.debtId } });
      if (!debt) throw appError.notFound("Debt not found");

      let newOutstanding: number;
      if (repayment.amountMinor <= debt.outstandingMinor) {
        newOutstanding = debt.outstandingMinor - repayment.amountMinor;
      } else {
        const excess = repayment.amountMinor - debt.outstandingMinor;
        newOutstanding = 0;
        await tx.customerCredit.create({
          data: {
            businessId: ctx.businessId,
            customerId: repayment.customerId,
            amountMinor: excess,
            reason: "Overpayment on verification",
            sourceType: "OVERPAYMENT",
            sourceId: debt.id,
            operationId: `${repaymentId}-verify-overpay`,
          },
        });
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
