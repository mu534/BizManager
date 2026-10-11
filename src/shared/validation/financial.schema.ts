/**
 * Zod v4 schemas for financial accounts and transactions.
 */
import { z } from "zod";

const moneyStr = z
  .string()
  .min(1, "Amount is required")
  .refine(
    (v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0,
    "Must be a positive number",
  );

export const createAccountSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  type: z.enum(["CASH", "MOBILE_MONEY", "BANK", "OTHER"], {
    error: "Invalid account type",
  }),
  isDefault: z.boolean().optional().default(false),
  /** Opening balance as decimal string */
  openingBalance: z
    .string()
    .optional()
    .default("0")
    .refine(
      (v) => !isNaN(parseFloat(v)) && parseFloat(v) >= 0,
      "Must be a non-negative number",
    ),
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;

export const transferSchema = z.object({
  fromAccountId: z.string().uuid("Invalid source account"),
  toAccountId: z.string().uuid("Invalid destination account"),
  amount: moneyStr,
  notes: z.string().max(500).optional(),
});

export type TransferInput = z.infer<typeof transferSchema>;

export const depositSchema = z.object({
  accountId: z.string().uuid("Invalid account"),
  amount: moneyStr,
  notes: z.string().max(500).optional(),
});

export type DepositInput = z.infer<typeof depositSchema>;

export const withdrawSchema = z.object({
  accountId: z.string().uuid("Invalid account"),
  amount: moneyStr,
  notes: z.string().max(500).optional(),
});

export type WithdrawInput = z.infer<typeof withdrawSchema>;
