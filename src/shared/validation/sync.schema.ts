/**
 * Zod v4 schemas for the offline sync batch endpoint.
 *
 * NOTE on branchId: the payload includes branchId so the server can
 * call resolveContext(businessId, branchId) for branch-scoped service
 * calls. The server NEVER trusts the payload branchId for authorization
 * — it re-derives the verified branchId from resolveContext.
 */
import { z } from "zod";
import { cartItemSchema } from "./sale.schema";

// ─── Per-entity payload schemas ───────────────────────────────────────────────

/**
 * Payload for an offline-created sale.
 * Server ignores totalAmount and finalTotal — all totals are recalculated
 * server-side from the items array.
 */
export const syncSalePayloadSchema = z.object({
  /** Items in the cart (validated by cartItemSchema) */
  items: z.array(cartItemSchema).min(1, "A sale must have at least one item"),
  /** Sale-level discount as decimal string */
  discountAmount: z
    .string()
    .optional()
    .default("0")
    .refine(
      (v) => !isNaN(parseFloat(v)) && parseFloat(v) >= 0,
      "Invalid discount",
    ),
  /** Payment account UUID */
  accountId: z.string().uuid("Invalid payment account"),
  notes: z.string().max(500).optional(),
  /**
   * branchId from the client payload.
   * Used to call resolveContext(businessId, branchId) — the server
   * re-derives the authoritative branchId from the verified context.
   * NEVER used directly for data access without resolveContext validation.
   */
  branchId: z.string().uuid("Invalid branch"),
});

export type SyncSalePayloadInput = z.infer<typeof syncSalePayloadSchema>;

/**
 * Payload for an offline-recorded expense.
 * amount is a decimal string (major units) — server converts to integer.
 */
export const syncExpensePayloadSchema = z.object({
  categoryId: z.string().uuid("Invalid category"),
  accountId: z.string().uuid("Invalid account"),
  /** Amount as decimal string e.g. "1500.00" */
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
  /**
   * branchId from the client payload — used to call
   * resolveContext(businessId, branchId) only.
   */
  branchId: z.string().uuid("Invalid branch"),
});

export type SyncExpensePayloadInput = z.infer<typeof syncExpensePayloadSchema>;

// ─── Discriminated union for a single sync operation ─────────────────────────

export const syncSaleOperationSchema = z.object({
  syncOperationId: z.string().uuid("Invalid syncOperationId"),
  entityType: z.literal("SALE"),
  operationType: z.literal("CREATE"),
  schemaVersion: z.literal(1),
  payload: syncSalePayloadSchema,
});

export const syncExpenseOperationSchema = z.object({
  syncOperationId: z.string().uuid("Invalid syncOperationId"),
  entityType: z.literal("EXPENSE"),
  operationType: z.literal("CREATE"),
  schemaVersion: z.literal(1),
  payload: syncExpensePayloadSchema,
});

export const syncOperationSchema = z.discriminatedUnion("entityType", [
  syncSaleOperationSchema,
  syncExpenseOperationSchema,
]);

export type SyncOperationInput = z.infer<typeof syncOperationSchema>;

// ─── Batch request schema ─────────────────────────────────────────────────────

export const syncBatchSchema = z.object({
  /** Device/installation identifier */
  clientId: z.string().min(1).max(100),
  /**
   * At most 50 operations per batch.
   * At least 1 so the server doesn't process empty batches.
   */
  operations: z
    .array(syncOperationSchema)
    .min(1, "Batch must contain at least one operation")
    .max(50, "Batch cannot exceed 50 operations"),
});

export type SyncBatchInput = z.infer<typeof syncBatchSchema>;

// ─── Response types (shared for client & server) ──────────────────────────────

export type SyncResultStatus = "SYNCED" | "CONFLICT" | "FAILED" | "DUPLICATE";

export interface SyncOperationResult {
  syncOperationId: string;
  status: SyncResultStatus;
  entityId?: string;
  error?: { code: string; message: string };
}

export interface SyncBatchResponse {
  results: SyncOperationResult[];
}
