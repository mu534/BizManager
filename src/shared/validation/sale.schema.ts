/**
 * Zod v4 validation schemas for sales and POS.
 */
import { z } from "zod";

export const cartItemSchema = z.object({
  productId: z.string().uuid("Invalid product"),
  /** Actual selling price as decimal string — e.g. "150.00" */
  unitPrice: z
    .string()
    .min(1)
    .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) >= 0, "Invalid price"),
  quantity: z.number().int().positive("Quantity must be at least 1"),
  /** Item-level discount as decimal string — e.g. "10.00" */
  discountAmount: z
    .string()
    .optional()
    .default("0")
    .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) >= 0, "Invalid discount"),
});

export type CartItemInput = z.infer<typeof cartItemSchema>;

export const createSaleSchema = z.object({
  branchId: z.string().uuid("Invalid branch"),
  items: z
    .array(cartItemSchema)
    .min(1, "A sale must have at least one item"),
  /** Sale-level discount as decimal string */
  discountAmount: z
    .string()
    .optional()
    .default("0")
    .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) >= 0, "Invalid discount"),
  /** Payment account ID */
  accountId: z.string().uuid("Invalid payment account"),
  notes: z.string().max(500).optional(),
  /** Client-generated UUID for offline idempotency */
  syncOperationId: z.string().uuid().optional(),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;

export const saleFilterSchema = z.object({
  branchId: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  status: z.enum(["COMPLETED", "RETURNED", "PARTIALLY_RETURNED", "VOIDED"]).optional(),
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

export type SaleFilterInput = z.infer<typeof saleFilterSchema>;

export const createReturnSchema = z.object({
  branchId: z.string().uuid("Invalid branch"),
  reason: z.string().max(500).optional(),
  refundAccountId: z.string().uuid("Invalid refund account"),
  items: z
    .array(
      z.object({
        saleItemId: z.string().uuid("Invalid sale item"),
        quantity: z.number().int().positive("Quantity must be at least 1"),
        stockDisposition: z.enum(["RESTOCK", "DAMAGED"]).default("RESTOCK"),
      }),
    )
    .min(1, "A return must include at least one item"),
  syncOperationId: z.string().uuid().optional(),
});

export type CreateReturnInput = z.infer<typeof createReturnSchema>;
