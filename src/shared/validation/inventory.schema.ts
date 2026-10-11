/**
 * Zod validation schemas for inventory management.
 * Zod v4 API.
 *
 * Quantity sign convention (enforced in the service, not here):
 *   Inflows (OPENING_STOCK, PURCHASE, SALE_RETURN, TRANSFER_IN): positive
 *   Outflows (SALE, DAMAGE, TRANSFER_OUT): negative
 *   MANUAL_ADJUST: caller provides signed quantity
 *
 * Money fields (unitCost) accept decimal strings — converted to integer in the service.
 */
import { z } from "zod";

const MOVEMENT_TYPES = [
  "OPENING_STOCK",
  "PURCHASE",
  "SALE",
  "SALE_RETURN",
  "DAMAGE",
  "MANUAL_ADJUST",
  "TRANSFER_IN",
  "TRANSFER_OUT",
] as const;

const moneyDecimalString = z
  .string()
  .min(1, "Cost is required")
  .refine(
    (v) => !isNaN(parseFloat(v)) && parseFloat(v) >= 0,
    "Must be a valid non-negative number",
  );

/**
 * Generic movement record — used internally.
 * For user-facing workflows use the specific schemas below.
 */
export const recordMovementSchema = z.object({
  productId: z.string().uuid("Invalid product"),
  branchId: z.string().uuid("Invalid branch"),
  type: z.enum(MOVEMENT_TYPES, { error: "Invalid movement type" }),
  /** Positive integer for the quantity amount; the service applies the sign. */
  quantity: z.number().int("Must be a whole number").positive("Quantity must be positive"),
  /** Decimal string for unit cost — optional for non-purchase movements. */
  unitCost: moneyDecimalString.optional(),
  notes: z.string().max(500).optional(),
  referenceId: z.string().optional(),
  referenceType: z.string().optional(),
  syncOperationId: z.string().uuid().optional(),
});

export type RecordMovementInput = z.infer<typeof recordMovementSchema>;

/**
 * Opening stock entry — sets initial inventory for a product at a branch.
 */
export const openingStockSchema = z.object({
  productId: z.string().uuid("Invalid product"),
  branchId: z.string().uuid("Invalid branch"),
  quantity: z
    .number()
    .int("Must be a whole number")
    .positive("Opening stock must be a positive quantity"),
  unitCost: moneyDecimalString,
  notes: z.string().max(500).optional(),
  syncOperationId: z.string().uuid().optional(),
});

export type OpeningStockInput = z.infer<typeof openingStockSchema>;

/**
 * Stock receipt / purchase entry — records goods received.
 */
export const stockReceiptSchema = z.object({
  productId: z.string().uuid("Invalid product"),
  branchId: z.string().uuid("Invalid branch"),
  quantity: z
    .number()
    .int("Must be a whole number")
    .positive("Quantity must be positive"),
  unitCost: moneyDecimalString,
  notes: z.string().max(500).optional(),
  syncOperationId: z.string().uuid().optional(),
});

export type StockReceiptInput = z.infer<typeof stockReceiptSchema>;

/**
 * Manual stock adjustment — can be positive (add) or negative (remove).
 */
export const adjustStockSchema = z.object({
  productId: z.string().uuid("Invalid product"),
  branchId: z.string().uuid("Invalid branch"),
  /**
   * Signed quantity: positive to add, negative to remove.
   * May not be zero.
   */
  quantity: z
    .number()
    .int("Must be a whole number")
    .refine((v) => v !== 0, "Quantity must not be zero"),
  reason: z.string().min(1, "Reason is required").max(200, "Reason is too long"),
  notes: z.string().max(500).optional(),
  syncOperationId: z.string().uuid().optional(),
});

export type AdjustStockInput = z.infer<typeof adjustStockSchema>;

/**
 * Damage / loss recording — always a reduction.
 */
export const recordDamageSchema = z.object({
  productId: z.string().uuid("Invalid product"),
  branchId: z.string().uuid("Invalid branch"),
  quantity: z
    .number()
    .int("Must be a whole number")
    .positive("Damaged quantity must be positive"),
  notes: z.string().max(500).optional(),
  syncOperationId: z.string().uuid().optional(),
});

export type RecordDamageInput = z.infer<typeof recordDamageSchema>;
