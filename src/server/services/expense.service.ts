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
import { Money } from "@shared/money";
import { requireOwnerOrManager } from "@server/auth/permissions";
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

/** Record a new expense atomically. */
export async function recordExpense(
  ctx: TenantContext,
  input: RecordExpenseInput,
): Promise<Expense> {
  requireOwnerOrManager(ctx);

  return prisma.$transaction(async (tx) => {
    // Idempotency.
    if (input.syncOperationId) {
      const existing = await tx.expense.findUnique({
        where: { syncOperationId: input.syncOperationId },
      });
      if (existing) return existing;
    }

    // Verify branch.
    const branch = await tx.branch.findUnique({ where: { id: input.branchId } });
    if (!branch || branch.businessId !== ctx.businessId) {
      throw appError.tenantViolation("Branch does not belong to this business.");
    }

    // Verify category.
    const category = await tx.expenseCategory.findUnique({
      where: { id: input.categoryId },
    });
    if (!category || category.businessId !== ctx.businessId) {
      throw appError.notFound("Expense category not found.");
    }

    // Verify account.
    const account = await tx.financialAccount.findUnique({
      where: { id: input.accountId },
    });
    if (!account || account.businessId !== ctx.businessId || account.status !== "ACTIVE") {
      throw appError.invalidAccount("Payment account not found or inactive.");
    }

    // Convert amount.
    const b = await tx.business.findUnique({
      where: { id: ctx.businessId },
      select: { currency: true },
    });
    if (!b) throw appError.notFound("Business not found.");
    const amount = Money.fromMajorUnits(parseFloat(input.amount), b.currency);

    if (account.currentBalance < amount) {
      throw appError.validationError(
        `Insufficient balance in "${account.name}" to record this expense.`,
      );
    }

    // Create expense.
    const expense = await tx.expense.create({
      data: {
        branchId: input.branchId,
        categoryId: input.categoryId,
        accountId: input.accountId,
        createdById: ctx.userId,
        amount,
        description: input.description ?? null,
        expenseDate: new Date(input.expenseDate),
        syncOperationId: input.syncOperationId ?? null,
      },
    });

    // Financial transaction.
    const newBalance = Money.subtract(account.currentBalance, amount);
    await tx.financialTransaction.create({
      data: {
        accountId: account.id,
        type: "EXPENSE_PAYMENT",
        amount,
        balanceAfter: newBalance,
        referenceId: expense.id,
        referenceType: "Expense",
      },
    });
    await tx.financialAccount.update({
      where: { id: account.id },
      data: { currentBalance: newBalance },
    });

    return expense;
  });
}

/** List expenses for a business/branch with optional filters. */
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

/** Soft-delete an expense. The FinancialTransaction is NOT reversed. */
export async function deleteExpense(
  ctx: TenantContext,
  expenseId: string,
): Promise<void> {
  requireOwnerOrManager(ctx);
  const expense = await getExpense(ctx, expenseId);
  await prisma.expense.update({
    where: { id: expense.id },
    data: { deletedAt: new Date() },
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
