/**
 * Financial accounts and transactions service — SERVER ONLY.
 *
 * All balance updates are atomic — FinancialTransaction and
 * FinancialAccount.currentBalance are always updated together.
 * Transfers never create revenue or expense records.
 */
import "server-only";
import type { FinancialAccount, FinancialTransaction } from "@prisma/client";
import { prisma } from "@server/db/prisma";
import { appError } from "@shared/errors";
import { Money } from "@shared/money";
import { requireOwnerOrManager } from "@server/auth/permissions";
import type { TenantContext } from "@shared/types/auth.types";
import type {
  CreateAccountInput,
  TransferInput,
  DepositInput,
  WithdrawInput,
} from "@shared/validation/financial.schema";

// ─── Helpers ───────────────────────────────────────────────

async function requireAccount(
  ctx: TenantContext,
  accountId: string,
): Promise<FinancialAccount> {
  const account = await prisma.financialAccount.findUnique({
    where: { id: accountId },
  });
  if (!account) throw appError.notFound("Account not found.");
  if (account.businessId !== ctx.businessId) {
    throw appError.tenantViolation("Account does not belong to this business.");
  }
  if (account.status !== "ACTIVE") {
    throw appError.invalidAccount("Account is not active.");
  }
  return account;
}

async function getBusinessCurrency(businessId: string): Promise<string> {
  const b = await prisma.business.findUnique({
    where: { id: businessId },
    select: { currency: true },
  });
  if (!b) throw appError.notFound("Business not found.");
  return b.currency;
}

// ─── Service functions ─────────────────────────────────────

/** List all financial accounts for the business. */
export async function listAccounts(
  ctx: TenantContext,
): Promise<FinancialAccount[]> {
  return prisma.financialAccount.findMany({
    where: { businessId: ctx.businessId, status: { not: "ARCHIVED" } },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
}

/** Create a new financial account, optionally with an opening balance. */
export async function createAccount(
  ctx: TenantContext,
  input: CreateAccountInput,
): Promise<FinancialAccount> {
  requireOwnerOrManager(ctx);
  const currency = await getBusinessCurrency(ctx.businessId);
  const openingBalance = Money.fromMajorUnits(
    parseFloat(input.openingBalance ?? "0"),
    currency,
  );

  return prisma.$transaction(async (tx) => {
    const account = await tx.financialAccount.create({
      data: {
        businessId: ctx.businessId,
        name: input.name,
        type: input.type,
        isDefault: input.isDefault,
        currentBalance: openingBalance,
      },
    });

    if (openingBalance > 0) {
      await tx.financialTransaction.create({
        data: {
          accountId: account.id,
          type: "MANUAL_CREDIT",
          amount: openingBalance,
          balanceAfter: openingBalance,
          notes: "Opening balance",
        },
      });
    }
    return account;
  });
}

/** Archive an account. Requires no outstanding balance concern — just marks inactive. */
export async function archiveAccount(
  ctx: TenantContext,
  accountId: string,
): Promise<FinancialAccount> {
  requireOwnerOrManager(ctx);
  await requireAccount(ctx, accountId);
  return prisma.financialAccount.update({
    where: { id: accountId },
    data: { status: "ARCHIVED" },
  });
}

/** Load an account with its current balance (direct from cache). */
export async function getAccount(
  ctx: TenantContext,
  accountId: string,
): Promise<FinancialAccount> {
  return requireAccount(ctx, accountId);
}

/** Get paginated transaction history for an account. */
export async function getAccountTransactions(
  ctx: TenantContext,
  accountId: string,
  page = 1,
  limit = 30,
): Promise<{ transactions: FinancialTransaction[]; total: number }> {
  await requireAccount(ctx, accountId);
  const skip = (page - 1) * limit;
  const [transactions, total] = await Promise.all([
    prisma.financialTransaction.findMany({
      where: { accountId },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.financialTransaction.count({ where: { accountId } }),
  ]);
  return { transactions, total };
}

/**
 * Transfer funds between two accounts.
 * Creates TRANSFER_OUT on the source and TRANSFER_IN on the destination.
 * Does NOT create revenue or expense — purely an account-to-account movement.
 */
export async function transferFunds(
  ctx: TenantContext,
  input: TransferInput,
): Promise<void> {
  requireOwnerOrManager(ctx);
  const currency = await getBusinessCurrency(ctx.businessId);
  const amount = Money.fromMajorUnits(parseFloat(input.amount), currency);

  await prisma.$transaction(async (tx) => {
    const fromAccount = await tx.financialAccount.findUnique({
      where: { id: input.fromAccountId },
    });
    const toAccount = await tx.financialAccount.findUnique({
      where: { id: input.toAccountId },
    });

    if (!fromAccount || fromAccount.businessId !== ctx.businessId || fromAccount.status !== "ACTIVE") {
      throw appError.invalidAccount("Source account not found or inactive.");
    }
    if (!toAccount || toAccount.businessId !== ctx.businessId || toAccount.status !== "ACTIVE") {
      throw appError.invalidAccount("Destination account not found or inactive.");
    }
    if (fromAccount.id === toAccount.id) {
      throw appError.validationError("Cannot transfer to the same account.");
    }
    if (fromAccount.currentBalance < amount) {
      throw appError.validationError("Insufficient balance for transfer.");
    }

    const fromNewBalance = Money.subtract(fromAccount.currentBalance, amount);
    const toNewBalance = Money.add(toAccount.currentBalance, amount);

    await tx.financialTransaction.create({
      data: {
        accountId: fromAccount.id,
        type: "TRANSFER_OUT",
        amount,
        balanceAfter: fromNewBalance,
        referenceId: toAccount.id,
        referenceType: "Transfer",
        notes: input.notes ?? null,
      },
    });
    await tx.financialAccount.update({
      where: { id: fromAccount.id },
      data: { currentBalance: fromNewBalance },
    });

    await tx.financialTransaction.create({
      data: {
        accountId: toAccount.id,
        type: "TRANSFER_IN",
        amount,
        balanceAfter: toNewBalance,
        referenceId: fromAccount.id,
        referenceType: "Transfer",
        notes: input.notes ?? null,
      },
    });
    await tx.financialAccount.update({
      where: { id: toAccount.id },
      data: { currentBalance: toNewBalance },
    });
  });
}

/** Record a manual deposit (MANUAL_CREDIT). */
export async function depositFunds(
  ctx: TenantContext,
  input: DepositInput,
): Promise<void> {
  requireOwnerOrManager(ctx);
  const currency = await getBusinessCurrency(ctx.businessId);
  const amount = Money.fromMajorUnits(parseFloat(input.amount), currency);

  await prisma.$transaction(async (tx) => {
    const account = await tx.financialAccount.findUnique({
      where: { id: input.accountId },
    });
    if (!account || account.businessId !== ctx.businessId || account.status !== "ACTIVE") {
      throw appError.invalidAccount("Account not found or inactive.");
    }
    const newBalance = Money.add(account.currentBalance, amount);
    await tx.financialTransaction.create({
      data: {
        accountId: account.id,
        type: "MANUAL_CREDIT",
        amount,
        balanceAfter: newBalance,
        notes: input.notes ?? null,
      },
    });
    await tx.financialAccount.update({
      where: { id: account.id },
      data: { currentBalance: newBalance },
    });
  });
}

/** Record a manual withdrawal (MANUAL_DEBIT). */
export async function withdrawFunds(
  ctx: TenantContext,
  input: WithdrawInput,
): Promise<void> {
  requireOwnerOrManager(ctx);
  const currency = await getBusinessCurrency(ctx.businessId);
  const amount = Money.fromMajorUnits(parseFloat(input.amount), currency);

  await prisma.$transaction(async (tx) => {
    const account = await tx.financialAccount.findUnique({
      where: { id: input.accountId },
    });
    if (!account || account.businessId !== ctx.businessId || account.status !== "ACTIVE") {
      throw appError.invalidAccount("Account not found or inactive.");
    }
    if (account.currentBalance < amount) {
      throw appError.validationError("Insufficient balance for withdrawal.");
    }
    const newBalance = Money.subtract(account.currentBalance, amount);
    await tx.financialTransaction.create({
      data: {
        accountId: account.id,
        type: "MANUAL_DEBIT",
        amount,
        balanceAfter: newBalance,
        notes: input.notes ?? null,
      },
    });
    await tx.financialAccount.update({
      where: { id: account.id },
      data: { currentBalance: newBalance },
    });
  });
}
