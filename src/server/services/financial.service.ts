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
import { requireFinancialReports, requireOwnerOrManager } from "@server/auth/permissions";
import { parseMoneyStrict } from "@shared/sale-math";
import { creditAccount, debitAccount, lockKey } from "@server/services/ledger";
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
  const openingBalance = parseMoneyStrict(input.openingBalance ?? "0", currency, "Opening balance");

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
  requireFinancialReports(ctx); // balances are financial data
  return requireAccount(ctx, accountId);
}

/** Get paginated transaction history for an account. */
export async function getAccountTransactions(
  ctx: TenantContext,
  accountId: string,
  page = 1,
  limit = 30,
): Promise<{ transactions: FinancialTransaction[]; total: number }> {
  requireFinancialReports(ctx); // transaction history is financial data
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
 * Transfer between two accounts of the same business.
 * Creates TRANSFER_OUT + TRANSFER_IN only — never revenue or expense.
 * Balance changes are atomic (see ledger.ts); a per-business lock keeps
 * opposite-direction transfers from deadlocking.
 */
export async function transferFunds(
  ctx: TenantContext,
  input: TransferInput,
): Promise<void> {
  requireOwnerOrManager(ctx);
  const currency = await getBusinessCurrency(ctx.businessId);
  const amount = parseMoneyStrict(input.amount, currency, "Amount");
  if (amount <= 0) throw appError.validationError("Amount must be greater than zero.");
  if (input.fromAccountId === input.toAccountId) {
    throw appError.validationError("Cannot transfer to the same account.");
  }

  await prisma.$transaction(async (tx) => {
    await lockKey(tx, `account-transfer:${ctx.businessId}`);
    const [fromAccount, toAccount] = await Promise.all([
      tx.financialAccount.findUnique({ where: { id: input.fromAccountId } }),
      tx.financialAccount.findUnique({ where: { id: input.toAccountId } }),
    ]);
    if (!fromAccount || fromAccount.businessId !== ctx.businessId || fromAccount.status !== "ACTIVE") {
      throw appError.invalidAccount("Source account not found or inactive.");
    }
    if (!toAccount || toAccount.businessId !== ctx.businessId || toAccount.status !== "ACTIVE") {
      throw appError.invalidAccount("Destination account not found or inactive.");
    }

    await debitAccount(tx, fromAccount.id, amount, "TRANSFER_OUT", fromAccount.name, {
      referenceId: toAccount.id,
      referenceType: "Transfer",
      notes: input.notes,
    });
    await creditAccount(tx, toAccount.id, amount, "TRANSFER_IN", {
      referenceId: fromAccount.id,
      referenceType: "Transfer",
      notes: input.notes,
    });
  });
}

/** Record a manual deposit (MANUAL_CREDIT). */
export async function depositFunds(ctx: TenantContext, input: DepositInput): Promise<void> {
  requireOwnerOrManager(ctx);
  const currency = await getBusinessCurrency(ctx.businessId);
  const amount = parseMoneyStrict(input.amount, currency, "Amount");

  await prisma.$transaction(async (tx) => {
    const account = await tx.financialAccount.findUnique({ where: { id: input.accountId } });
    if (!account || account.businessId !== ctx.businessId || account.status !== "ACTIVE") {
      throw appError.invalidAccount("Account not found or inactive.");
    }
    await creditAccount(tx, account.id, amount, "MANUAL_CREDIT", { notes: input.notes });
  });
}

/** Record a manual withdrawal (MANUAL_DEBIT). */
export async function withdrawFunds(ctx: TenantContext, input: WithdrawInput): Promise<void> {
  requireOwnerOrManager(ctx);
  const currency = await getBusinessCurrency(ctx.businessId);
  const amount = parseMoneyStrict(input.amount, currency, "Amount");

  await prisma.$transaction(async (tx) => {
    const account = await tx.financialAccount.findUnique({ where: { id: input.accountId } });
    if (!account || account.businessId !== ctx.businessId || account.status !== "ACTIVE") {
      throw appError.invalidAccount("Account not found or inactive.");
    }
    await debitAccount(tx, account.id, amount, "MANUAL_DEBIT", account.name, { notes: input.notes });
  });
}
