/**
 * Inventory service — SERVER ONLY.
 *
 * All stock changes go through this service. Quantity sign convention:
 *   Inflows  (OPENING_STOCK, PURCHASE, SALE_RETURN, TRANSFER_IN):  positive
 *   Outflows (SALE, DAMAGE, TRANSFER_OUT):                         negative
 *   MANUAL_ADJUST:                                                 caller-supplied sign
 *
 * The InventoryMovement table is the source of truth.
 * StockSnapshot is a performance cache — always updated atomically inside the same transaction.
 */
import "server-only";
import type {
  InventoryMovement,
  StockSnapshot,
  Product,
  InventoryMovementType,
} from "@prisma/client";
import { prisma } from "@server/db/prisma";
import { appError } from "@shared/errors";
import { Money } from "@shared/money";
import type { TenantContext } from "@shared/types/auth.types";
import type {
  OpeningStockInput,
  StockReceiptInput,
  AdjustStockInput,
  RecordDamageInput,
} from "@shared/validation/inventory.schema";

// ─── Constants ─────────────────────────────────────────────────────────────

/** Movement types that increase stock (inflows). */
const INFLOW_TYPES: InventoryMovementType[] = [
  "OPENING_STOCK",
  "PURCHASE",
  "SALE_RETURN",
  "TRANSFER_IN",
];

/** Movement types that decrease stock (outflows). */
const OUTFLOW_TYPES: InventoryMovementType[] = [
  "SALE",
  "DAMAGE",
  "TRANSFER_OUT",
];

// ─── Types ─────────────────────────────────────────────────────────────────

export interface RecordMovementParams {
  productId: string;
  branchId: string;
  type: InventoryMovementType;
  /**
   * Signed quantity in the direction of the movement type.
   * For inflows: pass a positive integer; the service will store it as-is.
   * For outflows: pass a positive integer; the service will negate it before storing.
   * For MANUAL_ADJUST: pass a signed integer (positive to add, negative to remove).
   */
  signedQuantity: number;
  unitCost?: number; // Integer storage units (already converted)
  notes?: string;
  referenceId?: string;
  referenceType?: string;
  syncOperationId?: string;
}

export interface StockLevelEntry {
  snapshot: StockSnapshot;
  product: Product;
}

export interface MovementHistoryResult {
  movements: InventoryMovement[];
  total: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

async function getBusinessCurrency(businessId: string): Promise<string> {
  const b = await prisma.business.findUnique({
    where: { id: businessId },
    select: { currency: true },
  });
  if (!b) throw appError.notFound("Business not found.");
  return b.currency;
}

// ─── Service functions ─────────────────────────────────────────────────────

/**
 * Record a stock movement atomically.
 *
 * This is the core inventory write operation. It:
 *   1. Verifies product and branch belong to the context business.
 *   2. For outflows: checks StockSnapshot; rejects if stock would go negative.
 *   3. Inserts the InventoryMovement with signed quantity.
 *   4. Upserts the StockSnapshot using Prisma increment.
 */
export async function recordMovement(
  ctx: TenantContext,
  params: RecordMovementParams,
): Promise<InventoryMovement> {
  return prisma.$transaction(async (tx) => {
    // 1. Verify product ownership.
    const product = await tx.product.findUnique({
      where: { id: params.productId },
    });
    if (!product) throw appError.notFound("Product not found.");
    if (product.businessId !== ctx.businessId) {
      throw appError.tenantViolation("Product does not belong to this business.");
    }

    // 2. Verify branch ownership.
    const branch = await tx.branch.findUnique({
      where: { id: params.branchId },
    });
    if (!branch) throw appError.notFound("Branch not found.");
    if (branch.businessId !== ctx.businessId) {
      throw appError.tenantViolation("Branch does not belong to this business.");
    }

    // 3. Compute the signed quantity to store.
    //    INFLOW types: stored as positive.
    //    OUTFLOW types: stored as negative.
    //    MANUAL_ADJUST: stored as-is (caller provides sign).
    let storedQuantity: number;
    if (INFLOW_TYPES.includes(params.type)) {
      storedQuantity = Math.abs(params.signedQuantity);
    } else if (OUTFLOW_TYPES.includes(params.type)) {
      storedQuantity = -Math.abs(params.signedQuantity);
    } else {
      // MANUAL_ADJUST
      storedQuantity = params.signedQuantity;
    }

    // 4. For outflows and negative adjustments: prevent negative stock.
    if (storedQuantity < 0) {
      const snapshot = await tx.stockSnapshot.findUnique({
        where: {
          productId_branchId: {
            productId: params.productId,
            branchId: params.branchId,
          },
        },
      });
      const currentStock = snapshot?.quantity ?? 0;
      if (currentStock + storedQuantity < 0) {
        throw appError.insufficientStock(
          `Insufficient stock. Current: ${currentStock}, attempted: ${Math.abs(storedQuantity)}.`,
        );
      }
    }

    // 5. Insert the InventoryMovement.
    const movement = await tx.inventoryMovement.create({
      data: {
        productId: params.productId,
        branchId: params.branchId,
        createdById: ctx.userId,
        type: params.type,
        quantity: storedQuantity,
        unitCost: params.unitCost ?? null,
        referenceId: params.referenceId ?? null,
        referenceType: params.referenceType ?? null,
        notes: params.notes ?? null,
        syncOperationId: params.syncOperationId ?? null,
      },
    });

    // 6. Upsert StockSnapshot using atomic increment.
    await tx.stockSnapshot.upsert({
      where: {
        productId_branchId: {
          productId: params.productId,
          branchId: params.branchId,
        },
      },
      create: {
        productId: params.productId,
        branchId: params.branchId,
        quantity: storedQuantity,
      },
      update: {
        quantity: { increment: storedQuantity },
      },
    });

    return movement;
  });
}

/**
 * Record opening stock for a product at a branch.
 * Converts unitCost from decimal string to integer via Money.fromMajorUnits.
 */
export async function recordOpeningStock(
  ctx: TenantContext,
  input: OpeningStockInput,
): Promise<InventoryMovement> {
  const currency = await getBusinessCurrency(ctx.businessId);
  const unitCost = Money.fromMajorUnits(parseFloat(input.unitCost), currency);

  return recordMovement(ctx, {
    productId: input.productId,
    branchId: input.branchId,
    type: "OPENING_STOCK",
    signedQuantity: input.quantity,
    unitCost,
    notes: input.notes,
    syncOperationId: input.syncOperationId,
  });
}

/**
 * Record a stock receipt (goods purchased and received).
 * Converts unitCost from decimal string to integer via Money.fromMajorUnits.
 */
export async function recordStockReceipt(
  ctx: TenantContext,
  input: StockReceiptInput,
): Promise<InventoryMovement> {
  const currency = await getBusinessCurrency(ctx.businessId);
  const unitCost = Money.fromMajorUnits(parseFloat(input.unitCost), currency);

  return recordMovement(ctx, {
    productId: input.productId,
    branchId: input.branchId,
    type: "PURCHASE",
    signedQuantity: input.quantity,
    unitCost,
    notes: input.notes,
    syncOperationId: input.syncOperationId,
  });
}

/**
 * Record a manual stock adjustment (positive to add, negative to remove).
 */
export async function adjustStock(
  ctx: TenantContext,
  input: AdjustStockInput,
): Promise<InventoryMovement> {
  return recordMovement(ctx, {
    productId: input.productId,
    branchId: input.branchId,
    type: "MANUAL_ADJUST",
    signedQuantity: input.quantity,
    notes: input.notes ?? input.reason,
    syncOperationId: input.syncOperationId,
  });
}

/**
 * Record damage or stock loss.
 */
export async function recordDamage(
  ctx: TenantContext,
  input: RecordDamageInput,
): Promise<InventoryMovement> {
  return recordMovement(ctx, {
    productId: input.productId,
    branchId: input.branchId,
    type: "DAMAGE",
    signedQuantity: input.quantity,
    notes: input.notes,
    syncOperationId: input.syncOperationId,
  });
}

/**
 * Get the current stock level for a product at a branch.
 * Returns 0 if no snapshot exists.
 */
export async function getStockLevel(
  ctx: TenantContext,
  productId: string,
  branchId: string,
): Promise<number> {
  // Verify product ownership.
  const product = await prisma.product.findUnique({
    where: { id: productId },
  });
  if (!product || product.businessId !== ctx.businessId) {
    throw appError.tenantViolation("Product does not belong to this business.");
  }

  const snapshot = await prisma.stockSnapshot.findUnique({
    where: { productId_branchId: { productId, branchId } },
  });
  return snapshot?.quantity ?? 0;
}

/**
 * Get all stock levels for a branch.
 * Returns snapshots with associated product information.
 */
export async function getStockLevels(
  ctx: TenantContext,
  branchId: string,
): Promise<StockLevelEntry[]> {
  // Verify branch belongs to this business.
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
  });
  if (!branch || branch.businessId !== ctx.businessId) {
    throw appError.tenantViolation("Branch does not belong to this business.");
  }

  const snapshots = await prisma.stockSnapshot.findMany({
    where: { branchId },
    include: { product: true },
    orderBy: { product: { name: "asc" } },
  });

  // Filter to only products belonging to this business (belt-and-suspenders).
  return snapshots
    .filter((s) => s.product.businessId === ctx.businessId)
    .map((s) => ({ snapshot: s, product: s.product }));
}

/**
 * Get all products with stock at or below their minimum stock level.
 */
export async function getLowStockProducts(
  ctx: TenantContext,
  branchId: string,
): Promise<StockLevelEntry[]> {
  // Verify branch belongs to this business.
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
  });
  if (!branch || branch.businessId !== ctx.businessId) {
    throw appError.tenantViolation("Branch does not belong to this business.");
  }

  const snapshots = await prisma.stockSnapshot.findMany({
    where: { branchId },
    include: { product: true },
  });

  return snapshots
    .filter(
      (s) =>
        s.product.businessId === ctx.businessId &&
        s.quantity <= s.product.minStockLevel,
    )
    .map((s) => ({ snapshot: s, product: s.product }));
}

/**
 * Get paginated movement history for a product at a branch.
 */
export async function getMovementHistory(
  ctx: TenantContext,
  productId: string,
  branchId: string,
  filters: { page?: number; limit?: number },
): Promise<MovementHistoryResult> {
  // Verify product ownership.
  const product = await prisma.product.findUnique({
    where: { id: productId },
  });
  if (!product || product.businessId !== ctx.businessId) {
    throw appError.tenantViolation("Product does not belong to this business.");
  }

  // Verify branch ownership.
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
  });
  if (!branch || branch.businessId !== ctx.businessId) {
    throw appError.tenantViolation("Branch does not belong to this business.");
  }

  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;
  const skip = (page - 1) * limit;

  const [movements, total] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where: { productId, branchId },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.inventoryMovement.count({ where: { productId, branchId } }),
  ]);

  return { movements, total };
}
