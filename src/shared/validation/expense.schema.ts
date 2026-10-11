/**
 * Zod v4 schemas for expense management.
 */
import { z } from "zod";

export const recordExpenseSchema = z.object({
  branchId: z.string().uuid("Invalid branch"),
  categoryId: z.string().uuid("Invalid category"),
  accountId: z.string().uuid("Invalid account"),
  /** Amount as decimal string — e.g. "1500.00" */
  amount: z
    .string()
    .min(1, "Amount is required")
    .refine(
      (v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0,
      "Amount must be positive",
    ),
  description: z.string().max(500).optional(),
  /** ISO date string YYYY-MM-DD */
  expenseDate: z
    .string()
    .min(1, "Date is required")
    .refine((v) => !isNaN(Date.parse(v)), "Invalid date"),
  syncOperationId: z.string().uuid().optional(),
});

export type RecordExpenseInput = z.infer<typeof recordExpenseSchema>;

export const expenseFilterSchema = z.object({
  branchId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1))
    .pipe(z.number().int().min(1).default(1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 20))
    .pipe(z.number().int().min(1).max(100).default(20)),
});

export type ExpenseFilterInput = z.infer<typeof expenseFilterSchema>;
