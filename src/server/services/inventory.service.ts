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
import { Prisma } from "@prisma/client";
import type {
  InventoryMovement,
  StockSnapshot,
  Product,
  InventoryMovementType,
} from "@prisma/client";
import { prisma } from "@server/db/prisma";
import { requireBranchAccess } from "@server/services/branch-access.service";
import { appError } from "@shared/errors";
import { parseMoneyStrict } from "@shared/sale-math";
import { computeWeightedAverageCost } from "@shared/costing";
import { requireOwnerOrManager } from "@server/auth/permissions";
import { assertSubscriptionActive } from "@server/services/subscription.service";
import { decrementStock, incrementStock } from "@server/services/ledger";
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
 * Fixes: (1) no role check — STAFF could adjust stock; now OWNER/MANAGER only.
 * (2) check-then-increment race could drive stock negative; the decrement is
 * now a guarded UPDATE. (3) a repeated syncOperationId threw a unique-
 * constraint error instead of returning the original movement.
 */
export async function recordMovement(
  ctx: TenantContext,
  params: RecordMovementParams,
): Promise<InventoryMovement> {
  requireOwnerOrManager(ctx);
  await assertSubscriptionActive(ctx);

  if (!Number.isInteger(params.signedQuantity) || params.signedQuantity === 0) {
    throw appError.validationError("Quantity must be a non-zero whole number.");
  }

  // Tenant checks up front (also keeps hostile ids out of the transaction).
  const product = await prisma.product.findUnique({ where: { id: params.productId } });
  if (!product) throw appError.notFound("Product not found.");
  if (product.businessId !== ctx.businessId) {
    throw appError.tenantViolation("Product does not belong to this business.");
  }
  await requireBranchAccess(ctx, params.branchId, { write: true });

  // INFLOW: positive. OUTFLOW: negative. MANUAL_ADJUST: caller's sign.
  let storedQuantity: number;
  if (INFLOW_TYPES.includes(params.type)) {
    storedQuantity = Math.abs(params.signedQuantity);
  } else if (OUTFLOW_TYPES.includes(params.type)) {
    storedQuantity = -Math.abs(params.signedQuantity);
  } else {
    storedQuantity = params.signedQuantity;
  }

  try {
    return await prisma.$transaction(async (tx) => {
      if (params.syncOperationId) {
        const existing = await tx.inventoryMovement.findUnique({
          where: { syncOperationId: params.syncOperationId },
        });
        if (existing) {
          if (existing.productId !== params.productId) {
            throw appError.conflict("This operation id has already been used.");
          }
          return existing;
        }
      }

      if (storedQuantity < 0) {
        await decrementStock(tx, params.productId, params.branchId, -storedQuantity, product.name);
      } else {
        // Cost-bearing receipts re-average the product cost (weighted average).
        // Lock the product row first so two concurrent receipts cannot both
        // average against the same stale on-hand figure.
        if (
          (params.type === "OPENING_STOCK" || params.type === "PURCHASE") &&
          params.unitCost !== undefined
        ) {
          await tx.$queryRaw`SELECT id FROM products WHERE id = ${params.productId} FOR UPDATE`;
          const locked = await tx.product.findUniqueOrThrow({
            where: { id: params.productId },
            select: { costPrice: true },
          });
          const onHand = await tx.stockSnapshot.aggregate({
            where: { productId: params.productId },
            _sum: { quantity: true },
          });
          const newCost = computeWeightedAverageCost({
            onHandQuantity: Math.max(0, onHand._sum.quantity ?? 0),
            currentUnitCost: locked.costPrice,
            receivedQuantity: storedQuantity,
            receivedUnitCost: params.unitCost,
          });
          await tx.product.update({
            where: { id: params.productId },
            data: { costPrice: newCost },
          });
        }
        await incrementStock(tx, params.productId, params.branchId, storedQuantity);
      }

      return tx.inventoryMovement.create({
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
    });
  } catch (err) {
    if (
      params.syncOperationId &&
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const winner = await prisma.inventoryMovement.findUnique({
        where: { syncOperationId: params.syncOperationId },
      });
      if (winner && winner.productId === params.productId) return winner;
    }
    throw err;
  }
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
  const unitCost = parseMoneyStrict(input.unitCost, currency, "Unit cost");

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
  const unitCost = parseMoneyStrict(input.unitCost, currency, "Unit cost");

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
  // Tenant + per-member branch access.
  await requireBranchAccess(ctx, branchId);

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
  // Tenant + per-member branch access.
  await requireBranchAccess(ctx, branchId);

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
