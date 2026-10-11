/**
 * Sale service — SERVER ONLY.
 *
 * All sale creation is atomic: Sale + SaleItems + Payment +
 * InventoryMovements + FinancialTransaction must succeed together
 * or none of them are committed.
 *
 * Money convention: all amounts are integers in smallest currency unit.
 * Totals are always recalculated server-side; never trust client-submitted totals.
 *
 * Idempotency: if syncOperationId is provided and already exists,
 * the original sale is returned without creating a duplicate.
 */
import "server-only";
import type { Sale, SaleItem, Payment, SaleReturn } from "@prisma/client";
import { prisma } from "@server/db/prisma";
import { appError } from "@shared/errors";
import { Money } from "@shared/money";
import { requireOwnerOrManager } from "@server/auth/permissions";
import type { TenantContext } from "@shared/types/auth.types";
import type { CreateSaleInput, CreateReturnInput, SaleFilterInput } from "@shared/validation/sale.schema";

// ─── Types ─────────────────────────────────────────────────

export interface SaleWithDetails extends Sale {
  items: (SaleItem & { product: { name: string; sku: string | null } })[];
  payments: (Payment & { account: { name: string; type: string } })[];
  returns: (SaleReturn & { items: { id: string; saleItemId: string; quantity: number; refundAmount: number }[]; createdBy: { name: string } })[];
  branch: { name: string };
  createdBy: { name: string };
}

export interface SaleListResult {
  sales: Sale[];
  total: number;
  page: number;
  limit: number;
}

export interface DaySummary {
  totalRevenue: number;
  salesCount: number;
  totalDiscounts: number;
}

// ─── Receipt number generation ──────────────────────────────

/**
 * Generate a receipt number: e.g. BRN-20261009-0042
 * Uses a database sequence approach: count sales for the branch+date, +1.
 * Called inside a transaction for safety.
 */
async function generateReceiptNumber(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  branchId: string,
): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
  const startOfDay = new Date(`${today.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const endOfDay = new Date(`${today.toISOString().slice(0, 10)}T23:59:59.999Z`);

  const count = await tx.sale.count({
    where: {
      branchId,
      createdAt: { gte: startOfDay, lte: endOfDay },
    },
  });

  const seq = String(count + 1).padStart(4, "0");
  return `BRN-${dateStr}-${seq}`;
}

// ─── Service functions ──────────────────────────────────────

/**
 * Create a sale atomically.
 * All totals are recalculated server-side.
 * Stock is validated within the transaction to handle concurrent sales.
 */
export async function createSale(
  ctx: TenantContext,
  input: CreateSaleInput,
): Promise<SaleWithDetails> {
  const branchId = input.branchId;

  // Get business currency for money conversion.
  const business = await prisma.business.findUnique({
    where: { id: ctx.businessId },
    select: { currency: true },
  });
  if (!business) throw appError.notFound("Business not found.");
  const currency = business.currency;

  return prisma.$transaction(async (tx) => {
    // ── Idempotency check ──────────────────────────────────
    if (input.syncOperationId) {
      const existing = await tx.sale.findUnique({
        where: { syncOperationId: input.syncOperationId },
        include: {
          items: { include: { product: { select: { name: true, sku: true } } } },
          payments: { include: { account: { select: { name: true, type: true } } } },
          returns: true,
          branch: { select: { name: true } },
          createdBy: { select: { name: true } },
        },
      });
      if (existing) return existing;
    }

    // ── Verify branch belongs to this business ─────────────
    const branch = await tx.branch.findUnique({ where: { id: branchId } });
    if (!branch || branch.businessId !== ctx.businessId) {
      throw appError.tenantViolation("Branch does not belong to this business.");
    }

    // ── Verify payment account belongs to this business ────
    const account = await tx.financialAccount.findUnique({
      where: { id: input.accountId },
    });
    if (!account || account.businessId !== ctx.businessId || account.status !== "ACTIVE") {
      throw appError.invalidAccount("Payment account not found or inactive.");
    }

    // ── Load and validate all products + stock ─────────────
    const saleDiscountAmount = Money.fromMajorUnits(
      parseFloat(input.discountAmount ?? "0"),
      currency,
    );

    let subtotal = 0;
    type ComputedItem = {
      productId: string;
      productName: string;
      productSku: string | null;
      unitPrice: number;
      unitCost: number;
      quantity: number;
      discountAmount: number;
      lineTotal: number;
    };
    const computedItems: ComputedItem[] = [];

    for (const item of input.items) {
      const product = await tx.product.findUnique({ where: { id: item.productId } });
      if (!product || product.businessId !== ctx.businessId) {
        throw appError.tenantViolation(`Product ${item.productId} not found.`);
      }
      if (product.status === "ARCHIVED") {
        throw appError.validationError(`Product "${product.name}" is archived.`);
      }

      // Server recalculates price using client-provided unitPrice only if authorized.
      // For STAFF, use the product's default selling price.
      const unitPrice =
        ctx.role === "STAFF"
          ? product.sellingPrice
          : Money.fromMajorUnits(parseFloat(item.unitPrice), currency);

      const itemDiscount = Money.fromMajorUnits(
        parseFloat(item.discountAmount ?? "0"),
        currency,
      );
      if (itemDiscount < 0 || itemDiscount > Money.multiply(unitPrice, item.quantity)) {
        throw appError.validationError(`Invalid discount for "${product.name}".`);
      }

      const lineTotal = Money.subtract(
        Money.multiply(unitPrice, item.quantity),
        itemDiscount,
      );
      if (lineTotal < 0) throw appError.validationError(`Line total cannot be negative.`);

      subtotal = Money.add(subtotal, lineTotal);

      // ── Stock check inside transaction ─────────────────
      const snapshot = await tx.stockSnapshot.findUnique({
        where: { productId_branchId: { productId: item.productId, branchId } },
      });
      const currentStock = snapshot?.quantity ?? 0;
      if (currentStock < item.quantity) {
        throw appError.insufficientStock(
          `Insufficient stock for "${product.name}". Available: ${currentStock}, requested: ${item.quantity}.`,
        );
      }

      computedItems.push({
        productId: item.productId,
        productName: product.name,
        productSku: product.sku,
        unitPrice,
        unitCost: product.costPrice,
        quantity: item.quantity,
        discountAmount: itemDiscount,
        lineTotal,
      });
    }

    if (saleDiscountAmount < 0 || saleDiscountAmount > subtotal) {
      throw appError.validationError("Sale discount cannot exceed subtotal.");
    }
    const finalTotal = Money.subtract(subtotal, saleDiscountAmount);
    if (finalTotal < 0) throw appError.validationError("Final total cannot be negative.");

    // ── Create Sale ────────────────────────────────────────
    const receiptNumber = await generateReceiptNumber(tx, branchId);

    const sale = await tx.sale.create({
      data: {
        branchId,
        createdById: ctx.userId,
        status: "COMPLETED",
        subtotal,
        discountAmount: saleDiscountAmount,
        finalTotal,
        receiptNumber,
        syncOperationId: input.syncOperationId ?? null,
        notes: input.notes ?? null,
      },
    });

    // ── Create SaleItems + InventoryMovements ──────────────
    for (const item of computedItems) {
      await tx.saleItem.create({
        data: {
          saleId: sale.id,
          productId: item.productId,
          productName: item.productName,
          productSku: item.productSku,
          unitPrice: item.unitPrice,
          unitCost: item.unitCost,
          quantity: item.quantity,
          discountAmount: item.discountAmount,
          lineTotal: item.lineTotal,
        },
      });

      // Decrement stock.
      await tx.inventoryMovement.create({
        data: {
          productId: item.productId,
          branchId,
          createdById: ctx.userId,
          type: "SALE",
          quantity: -item.quantity,
          unitCost: item.unitCost,
          referenceId: sale.id,
          referenceType: "Sale",
        },
      });
      await tx.stockSnapshot.upsert({
        where: { productId_branchId: { productId: item.productId, branchId } },
        create: { productId: item.productId, branchId, quantity: -item.quantity },
        update: { quantity: { increment: -item.quantity } },
      });
    }

    // ── Payment + FinancialTransaction ─────────────────────
    await tx.payment.create({
      data: { saleId: sale.id, accountId: account.id, amount: finalTotal },
    });

    const newBalance = Money.add(account.currentBalance, finalTotal);
    await tx.financialTransaction.create({
      data: {
        accountId: account.id,
        type: "SALE_PAYMENT",
        amount: finalTotal,
        balanceAfter: newBalance,
        referenceId: sale.id,
        referenceType: "Sale",
      },
    });
    await tx.financialAccount.update({
      where: { id: account.id },
      data: { currentBalance: newBalance },
    });

    // ── Return full sale with relations ────────────────────
    return tx.sale.findUniqueOrThrow({
      where: { id: sale.id },
      include: {
        items: { include: { product: { select: { name: true, sku: true } } } },
        payments: { include: { account: { select: { name: true, type: true } } } },
        returns: {
          include: {
            items: { select: { id: true, saleItemId: true, quantity: true, refundAmount: true } },
            createdBy: { select: { name: true } },
          },
        },
        branch: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    });
  });
}

/** Load a single sale with full details. Enforces tenant ownership. */
export async function getSale(
  ctx: TenantContext,
  saleId: string,
): Promise<SaleWithDetails> {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: {
      items: { include: { product: { select: { name: true, sku: true } } } },
      payments: { include: { account: { select: { name: true, type: true } } } },
      returns: {
        include: {
          items: { select: { id: true, saleItemId: true, quantity: true, refundAmount: true } },
          createdBy: { select: { name: true } },
        },
      },
      branch: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!sale) throw appError.notFound("Sale not found.");

  // Verify ownership through the branch.
  const branch = await prisma.branch.findUnique({ where: { id: sale.branchId } });
  if (!branch || branch.businessId !== ctx.businessId) {
    throw appError.tenantViolation("Sale does not belong to this business.");
  }
  return sale;
}

/** List sales for a branch with optional filters. */
export async function listSales(
  ctx: TenantContext,
  filters: SaleFilterInput,
): Promise<SaleListResult> {
  const branchId = filters.branchId ?? ctx.branchId;
  if (!branchId) throw appError.validationError("Branch is required.");

  // Verify branch ownership.
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch || branch.businessId !== ctx.businessId) {
    throw appError.tenantViolation("Branch does not belong to this business.");
  }

  const where = {
    branchId,
    deletedAt: null,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: new Date(filters.from) } : {}),
            ...(filters.to ? { lte: new Date(filters.to) } : {}),
          },
        }
      : {}),
  };

  const skip = (filters.page - 1) * filters.limit;
  const [sales, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: filters.limit,
      include: {
        payments: { include: { account: { select: { name: true } } } },
        _count: { select: { items: true } },
      },
    }),
    prisma.sale.count({ where }),
  ]);

  return { sales, total, page: filters.page, limit: filters.limit };
}

/** Get today's sales summary for a branch. */
export async function getTodaysSummary(
  ctx: TenantContext,
  branchId: string,
): Promise<DaySummary> {
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch || branch.businessId !== ctx.businessId) {
    throw appError.tenantViolation("Branch does not belong to this business.");
  }

  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);

  const result = await prisma.sale.aggregate({
    where: {
      branchId,
      status: "COMPLETED",
      deletedAt: null,
      createdAt: { gte: start, lte: end },
    },
    _sum: { finalTotal: true, discountAmount: true },
    _count: { id: true },
  });

  return {
    totalRevenue: result._sum.finalTotal ?? 0,
    salesCount: result._count.id,
    totalDiscounts: result._sum.discountAmount ?? 0,
  };
}

/**
 * Create a sale return atomically.
 * Validates return quantities, restocks sellable items, issues refund.
 * Idempotent via syncOperationId.
 */
export async function createReturn(
  ctx: TenantContext,
  saleId: string,
  input: CreateReturnInput,
): Promise<SaleReturn> {
  requireOwnerOrManager(ctx);

  const business = await prisma.business.findUnique({
    where: { id: ctx.businessId },
    select: { currency: true },
  });
  if (!business) throw appError.notFound("Business not found.");
  const currency = business.currency;

  return prisma.$transaction(async (tx) => {
    // Idempotency.
    if (input.syncOperationId) {
      const existing = await tx.saleReturn.findUnique({
        where: { syncOperationId: input.syncOperationId },
      });
      if (existing) return existing;
    }

    // Load the original sale.
    const sale = await tx.sale.findUnique({
      where: { id: saleId },
      include: {
        items: true,
        returns: {
          include: { items: true },
        },
        branch: { select: { businessId: true } },
      },
    });
    if (!sale) throw appError.notFound("Sale not found.");
    if (sale.branch.businessId !== ctx.businessId) {
      throw appError.tenantViolation("Sale does not belong to this business.");
    }
    if (sale.status === "VOIDED" || sale.status === "RETURNED") {
      throw appError.validationError("This sale cannot be returned.");
    }

    // Verify refund account.
    const refundAccount = await tx.financialAccount.findUnique({
      where: { id: input.refundAccountId },
    });
    if (!refundAccount || refundAccount.businessId !== ctx.businessId || refundAccount.status !== "ACTIVE") {
      throw appError.invalidAccount("Refund account not found or inactive.");
    }

    // Build a map of already-returned quantities per saleItemId.
    const alreadyReturned = new Map<string, number>();
    for (const ret of sale.returns) {
      for (const ri of ret.items) {
        alreadyReturned.set(
          ri.saleItemId,
          (alreadyReturned.get(ri.saleItemId) ?? 0) + ri.quantity,
        );
      }
    }

    // Validate and compute return items.
    type ReturnItemComputed = {
      saleItemId: string;
      saleItem: typeof sale.items[0];
      quantity: number;
      refundAmount: number;
      stockDisposition: "RESTOCK" | "DAMAGED";
    };
    const returnItems: ReturnItemComputed[] = [];
    let totalRefund = 0;

    for (const ri of input.items) {
      const saleItem = sale.items.find((si) => si.id === ri.saleItemId);
      if (!saleItem) throw appError.validationError(`Sale item ${ri.saleItemId} not found.`);

      const prevReturned = alreadyReturned.get(ri.saleItemId) ?? 0;
      const maxReturnable = saleItem.quantity - prevReturned;
      if (ri.quantity > maxReturnable) {
        throw appError.invalidReturn(
          `Cannot return ${ri.quantity} of "${saleItem.productName}". Max returnable: ${maxReturnable}.`,
        );
      }

      // Refund = (lineTotal / original_quantity) × return_quantity
      // Using integer math to avoid floating point.
      const refundPerUnit = Math.round(saleItem.lineTotal / saleItem.quantity);
      const refundAmount = Money.multiply(refundPerUnit, ri.quantity);

      returnItems.push({
        saleItemId: ri.saleItemId,
        saleItem,
        quantity: ri.quantity,
        refundAmount,
        stockDisposition: ri.stockDisposition,
      });
      totalRefund = Money.add(totalRefund, refundAmount);
    }

    // Validate refund account has enough balance.
    if (refundAccount.currentBalance < totalRefund) {
      throw appError.validationError(
        `Insufficient balance in "${refundAccount.name}" to issue refund.`,
      );
    }

    // Create SaleReturn.
    const saleReturn = await tx.saleReturn.create({
      data: {
        saleId: sale.id,
        branchId: sale.branchId,
        createdById: ctx.userId,
        reason: input.reason ?? null,
        totalRefund,
        syncOperationId: input.syncOperationId ?? null,
        status: "COMPLETED",
        refundAccountId: refundAccount.id,
        items: {
          create: returnItems.map((ri) => ({
            saleItemId: ri.saleItemId,
            quantity: ri.quantity,
            refundAmount: ri.refundAmount,
            stockDisposition: ri.stockDisposition,
          })),
        },
      },
    });

    // Restock sellable items + create inventory movements.
    for (const ri of returnItems) {
      if (ri.stockDisposition === "RESTOCK") {
        await tx.inventoryMovement.create({
          data: {
            productId: ri.saleItem.productId,
            branchId: sale.branchId,
            createdById: ctx.userId,
            type: "SALE_RETURN",
            quantity: ri.quantity,
            unitCost: ri.saleItem.unitCost,
            referenceId: saleReturn.id,
            referenceType: "SaleReturn",
          },
        });
        await tx.stockSnapshot.upsert({
          where: {
            productId_branchId: {
              productId: ri.saleItem.productId,
              branchId: sale.branchId,
            },
          },
          create: {
            productId: ri.saleItem.productId,
            branchId: sale.branchId,
            quantity: ri.quantity,
          },
          update: { quantity: { increment: ri.quantity } },
        });
      }
    }

    // Financial transaction: deduct from refund account.
    const newBalance = Money.subtract(refundAccount.currentBalance, totalRefund);
    await tx.financialTransaction.create({
      data: {
        accountId: refundAccount.id,
        type: "REFUND",
        amount: totalRefund,
        balanceAfter: newBalance,
        referenceId: saleReturn.id,
        referenceType: "SaleReturn",
      },
    });
    await tx.financialAccount.update({
      where: { id: refundAccount.id },
      data: { currentBalance: newBalance },
    });

    // Update Sale status.
    const totalReturnedNow = sale.returns.reduce(
      (sum, r) => sum + r.totalRefund,
      0,
    ) + totalRefund;
    const newSaleStatus =
      totalReturnedNow >= sale.finalTotal ? "RETURNED" : "PARTIALLY_RETURNED";
    await tx.sale.update({ where: { id: sale.id }, data: { status: newSaleStatus } });

    return saleReturn;
  });
}
