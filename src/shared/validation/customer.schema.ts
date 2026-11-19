/** Zod v4 schemas for customers and the payments they make against their tab. */
import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1, "Enter the customer's name").max(100),
  phone: optionalText(30),
  notes: optionalText(500),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const receiveCustomerPaymentSchema = z.object({
  accountId: z.string().uuid("Choose where the money went"),
  /** Decimal string in major units, e.g. "250.00". */
  amount: z
    .string()
    .trim()
    .min(1, "Enter the amount received")
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v) && parseFloat(v) > 0, "Enter an amount greater than zero"),
  operationId: z.string().uuid(),
  notes: optionalText(300),
});
export type ReceiveCustomerPaymentInput = z.infer<typeof receiveCustomerPaymentSchema>;