import { z } from "zod";
import { BILLING_PERIODS, PLAN_CODES } from "@shared/plans";

export const submitPaymentSchema = z.object({
  planCode: z.enum(PLAN_CODES, { message: "Choose a plan." }),
  billingPeriod: z.enum(BILLING_PERIODS, { message: "Choose monthly or yearly billing." }),
  method: z.enum(["TELEBIRR", "BANK_TRANSFER"], { message: "Choose how you paid." }),
  reference: z
    .string()
    .trim()
    .min(4, "Enter the transaction reference from your receipt.")
    .max(64, "Reference is too long.")
    .regex(/^[A-Za-z0-9\-_/. ]+$/, "Use only letters, numbers and - _ / . in the reference."),
});
export type SubmitPaymentInput = z.infer<typeof submitPaymentSchema>;

export const rejectPaymentSchema = z.object({
  paymentId: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .min(5, "Give the customer a clear reason (at least 5 characters).")
    .max(500, "Reason is too long."),
});
