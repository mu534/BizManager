/**
 * Transactional primitives for account balances and stock — SERVER ONLY.
 *
 * Why this exists: the services used to read a balance/stock value, compute a
 * new one in JavaScript, then write it back. Under concurrency (two sales to
 * the same till, two sales of the last unit) that loses updates and oversells.
 *
 * Every function here must be called inside a `prisma.$transaction`. Changes
 * are expressed as atomic, guarded UPDATE statements so correctness does not
 * depend on the read that preceded them:
 *
 *   - debit/decrement use `UPDATE … WHERE balance >= amount` and check the
 *     affected-row count, so they cannot go negative even if two transactions
 *     interleave;
 *   - credit/increment use `{ increment }`, evaluated by PostgreSQL;
 *   - `balanceAfter` is read back after our own UPDATE, while we still hold
 *     the row lock, so it is exact.
 */
import "server-only";
import type { FinancialTransactionType, Prisma } from "@prisma/client";
import { appError } from "@shared/errors";

export type Tx = Prisma.TransactionClient;

interface LedgerRef {
  referenceId?: string;
  referenceType?: string;
  notes?: string;
}

/**
 * Serialise concurrent work on a logical key for the life of the transaction
 * (e.g. all sales in one branch, all returns of one sale). The lock is
 * released automatically on commit/rollback.
 */
export async function lockKey(tx: Tx, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

export async function creditAccount(
  tx: Tx,
  accountId: string,
  amount: number,
  type: FinancialTransactionType,
  ref: LedgerRef = {},
): Promise<number> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw appError.validationError("Amount must be a positive whole number of minor units.");
  }
  const updated = await tx.financialAccount.update({
    where: { id: accountId },
    data: { currentBalance: { increment: amount } },
    select: { currentBalance: true },
  });
  await tx.financialTransaction.create({
    data: {
      accountId,
      type,
      amount,
      balanceAfter: updated.currentBalance,
      referenceId: ref.referenceId ?? null,
      referenceType: ref.referenceType ?? null,
      notes: ref.notes ?? null,
    },
  });
  return updated.currentBalance;
}

export async function debitAccount(
  tx: Tx,
  accountId: string,
  amount: number,
  type: FinancialTransactionType,
  accountName: string,
  ref: LedgerRef = {},
): Promise<number> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw appError.validationError("Amount must be a positive whole number of minor units.");
  }
  const result = await tx.financialAccount.updateMany({
    where: { id: accountId, currentBalance: { gte: amount } },
    data: { currentBalance: { decrement: amount } },
  });
  if (result.count === 0) {
    throw appError.validationError(`Insufficient balance in "${accountName}".`);
  }
  const updated = await tx.financialAccount.findUniqueOrThrow({
    where: { id: accountId },
    select: { currentBalance: true },
  });
  await tx.financialTransaction.create({
    data: {
      accountId,
      type,
      amount,
      balanceAfter: updated.currentBalance,
      referenceId: ref.referenceId ?? null,
      referenceType: ref.referenceType ?? null,
      notes: ref.notes ?? null,
    },
  });
  return updated.currentBalance;
}

/** Atomically add stock (creating the snapshot row if needed). */
export async function incrementStock(
  tx: Tx,
  productId: string,
  branchId: string,
  quantity: number,
): Promise<void> {
  await tx.stockSnapshot.upsert({
    where: { productId_branchId: { productId, branchId } },
    create: { productId, branchId, quantity },
    update: { quantity: { increment: quantity } },
  });
}

/**
 * Atomically remove stock. Fails with INSUFFICIENT_STOCK if the snapshot does
 * not hold at least `quantity` — the guard lives in the UPDATE itself.
 */
export async function decrementStock(
  tx: Tx,
  productId: string,
  branchId: string,
  quantity: number,
  productName: string,
): Promise<void> {
  const result = await tx.stockSnapshot.updateMany({
    where: { productId, branchId, quantity: { gte: quantity } },
    data: { quantity: { decrement: quantity } },
  });
  if (result.count === 0) {
    const snapshot = await tx.stockSnapshot.findUnique({
      where: { productId_branchId: { productId, branchId } },
      select: { quantity: true },
    });
    throw appError.insufficientStock(
      `Insufficient stock for "${productName}". Available: ${snapshot?.quantity ?? 0}, requested: ${quantity}.`,
    );
  }
}
