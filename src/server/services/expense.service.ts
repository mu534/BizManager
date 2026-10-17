/**
 * Expense service — SERVER ONLY.
 *
 * Recording an expense atomically creates the Expense record
 * and its FinancialTransaction (EXPENSE_PAYMENT), updating the
 * account's currentBalance cache.
 */
import "server-only";
import type { Expense } from "@prisma/client";
import { prisma } from "@server/db/prisma";
import { appError } from "@shared/errors";
import { Prisma } from "@prisma/client";
import { requireOwnerOrManager } from "@server/auth/permissions";
import { parseMoneyStrict } from "@shared/sale-math";
import { assertSubscriptionActive } from "@server/services/subscription.service";
import { getBusinessTime } from "@server/services/business-time";
import { creditAccount, debitAccount } from "@server/services/ledger";
import type { TenantContext } from "@shared/types/auth.types";
import type { RecordExpenseInput, ExpenseFilterInput } from "@shared/validation/expense.schema";

type ExpenseWithRelations = Expense & {
  category: { id: string; name: string };
  account: { id: string; name: string; type: string };
  createdBy: { name: string };
};

export interface ExpenseListResult {
  expenses: ExpenseWithRelations[];
  total: number;
  page: number;
  limit: number;
}

export async function recordExpense(
  ctx: TenantContext,
  input: RecordExpenseInput,
): Promise<Expense> {
  requireOwnerOrManager(ctx);
  await assertSubscriptionActive(ctx);

  const branch = await prisma.branch.findUnique({ where: { id: input.branchId } });
  if (!branch || branch.businessId !== ctx.businessId) {
    throw appError.tenantViolation("Branch does not belong to this business.");
  }
  const { currency } = await getBusinessTime(ctx.businessId);
  const amount = parseMoneyStrict(input.amount, currency, "Amount");
  if (amount <= 0) throw appError.validationError("Amount must be greater than zero.");

  try {
    return await prisma.$transaction(async (tx) => {
      if (input.syncOperationId) {
        const existing = await tx.expense.findUnique({
          where: { syncOperationId: input.syncOperationId },
          include: { branch: { select: { businessId: true } } },
        });
        if (existing) {
          if (existing.branch.businessId !== ctx.businessId) {
            throw appError.conflict("This operation id has already been used.");
          }
          const { branch: _b, ...expense } = existing;
          return expense;
        }
      }

      const category = await tx.expenseCategory.findUnique({ where: { id: input.categoryId } });
      if (!category || category.businessId !== ctx.businessId) {
        throw appError.notFound("Expense category not found.");
      }
      const account = await tx.financialAccount.findUnique({ where: { id: input.accountId } });
      if (!account || account.businessId !== ctx.businessId || account.status !== "ACTIVE") {
        throw appError.invalidAccount("Payment account not found or inactive.");
      }

      const expense = await tx.expense.create({
        data: {
          branchId: input.branchId,
          categoryId: input.categoryId,
          accountId: input.accountId,
          createdById: ctx.userId,
          amount,
          description: input.description ?? null,
          expenseDate: new Date(`${input.expenseDate.slice(0, 10)}T00:00:00.000Z`),
          syncOperationId: input.syncOperationId ?? null,
        },
      });

      // Atomic, guarded debit: an expense can never overdraw the account.
      await debitAccount(tx, account.id, amount, "EXPENSE_PAYMENT", account.name, {
        referenceId: expense.id,
        referenceType: "Expense",
      });
      return expense;
    });
  } catch (err) {
    if (
      input.syncOperationId &&
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const winner = await prisma.expense.findUnique({
        where: { syncOperationId: input.syncOperationId },
        include: { branch: { select: { businessId: true } } },
      });
      if (winner && winner.branch.businessId === ctx.businessId) {
        const { branch: _b, ...expense } = winner;
        return expense;
      }
    }
    throw err;
  }
}

export async function listExpenses(
  ctx: TenantContext,
  filters: ExpenseFilterInput,
): Promise<ExpenseListResult> {
  const branchId = filters.branchId ?? ctx.branchId;

  // If branchId provided, verify ownership.
  if (branchId) {
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch || branch.businessId !== ctx.businessId) {
      throw appError.tenantViolation("Branch does not belong to this business.");
    }
  }

  // Build where clause that always scopes to the business via branch.
  const branchIds = branchId
    ? [branchId]
    : (
        await prisma.branch.findMany({
          where: { businessId: ctx.businessId },
          select: { id: true },
        })
      ).map((b) => b.id);

  const where = {
    branchId: { in: branchIds },
    deletedAt: null,
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.from || filters.to
      ? {
          expenseDate: {
            ...(filters.from ? { gte: new Date(filters.from) } : {}),
            ...(filters.to ? { lte: new Date(filters.to) } : {}),
          },
        }
      : {}),
  };

  const skip = (filters.page - 1) * filters.limit;
  const [expenses, total] = await Promise.all([
    prisma.expense.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
        account: { select: { id: true, name: true, type: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
      skip,
      take: filters.limit,
    }),
    prisma.expense.count({ where }),
  ]);

  return {
    expenses: expenses as ExpenseWithRelations[],
    total,
    page: filters.page,
    limit: filters.limit,
  };
}

/** Get a single expense. Enforces tenant ownership via branch. */
export async function getExpense(
  ctx: TenantContext,
  expenseId: string,
): Promise<ExpenseWithRelations> {
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId, deletedAt: null },
    include: {
      category: { select: { id: true, name: true } },
      account: { select: { id: true, name: true, type: true } },
      createdBy: { select: { name: true } },
      branch: { select: { businessId: true } },
    },
  });
  if (!expense) throw appError.notFound("Expense not found.");
  if (
    (expense as typeof expense & { branch: { businessId: string } }).branch
      .businessId !== ctx.businessId
  ) {
    throw appError.tenantViolation("Expense does not belong to this business.");
  }
  return expense as ExpenseWithRelations;
}

/**
 * Delete (void) an expense. The expense is soft-deleted AND its payment is
 * reversed in the ledger with a MANUAL_CREDIT entry, so the account balance
 * and the books stay consistent. (Previously the money was never returned.)
 * Idempotent: deleting an already-deleted expense is a no-op.
 */
export async function deleteExpense(ctx: TenantContext, expenseId: string): Promise<void> {
  requireOwnerOrManager(ctx);
  const expense = await getExpense(ctx, expenseId);

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.expense.updateMany({
      where: { id: expense.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (claimed.count === 0) return; // already deleted — do not reverse twice
    await creditAccount(tx, expense.accountId, expense.amount, "MANUAL_CREDIT", {
      referenceId: expense.id,
      referenceType: "ExpenseReversal",
      notes: "Reversal of deleted expense",
    });
  });
}

/** List expense categories for the business. */
export async function listExpenseCategories(
  ctx: TenantContext,
): Promise<{ id: string; name: string }[]> {
  return prisma.expenseCategory.findMany({
    where: { businessId: ctx.businessId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
