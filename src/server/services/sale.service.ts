/**
 * Sale service — SERVER ONLY.
 *
 * Atomicity: Sale + SaleItems + Payment + InventoryMovements + stock
 * snapshots + FinancialTransaction commit together or not at all.
 *
 * Concurrency (fixes — see REDESIGN_ASSESSMENT.md):
 *  - All sales for a branch are serialised with a transaction-scoped advisory
 *    lock, which also makes receipt numbers gap-free and unique.
 *  - Stock is removed with a guarded UPDATE (`quantity >= n`), so even without
 *    the lock two sales cannot both take the last unit.
 *  - Account balances change with atomic increments, never read-modify-write.
 *  - Returns of one sale are serialised so quantities cannot be over-returned
 *    by two simultaneous requests.
 *
 * Money: integers in the smallest currency unit. Totals are always
 * recomputed server-side from catalogue data; client totals are never trusted.
 *
 * Idempotency: a repeated syncOperationId returns the original record — but
 * only if it belongs to the caller's business (it used to leak across tenants).
 */
import "server-only";
import { Prisma } from "@prisma/client";
import type { Sale, SaleItem, Payment, SaleReturn } from "@prisma/client";
import { prisma } from "@server/db/prisma";
import { requireBranchAccess } from "@server/services/branch-access.service";
import { appError } from "@shared/errors";
import { requireOwnerOrManager, canApplyPriceOverride } from "@server/auth/permissions";
import { assertWithinLimit, LIMIT_KEYS } from "@server/services/subscription.service";
import { getBusinessTime } from "@server/services/business-time";
import {
  creditAccount,
  debitAccount,
  decrementStock,
  incrementStock,
  lockKey,
  type Tx,
} from "@server/services/ledger";
import { allocateSaleDiscount, lineNetPaid, refundForReturn } from "@shared/refunds";
import {
  computeSale,
  SaleMathError,
  totalQuantityByProduct,
  type ProductPricing,
} from "@shared/sale-math";
import { businessDayKey, endOfBusinessDay, isDayKey, startOfBusinessDay } from "@shared/time";
import type { TenantContext } from "@shared/types/auth.types";
import type { CreateSaleInput, CreateReturnInput, SaleFilterInput } from "@shared/validation/sale.schema";

// ─── Types ─────────────────────────────────────────────────

export interface SaleWithDetails extends Sale {
  items: (SaleItem & { product: { name: string; sku: string | null } })[];
  payments: (Payment & { account: { name: string; type: string } })[];
  returns: (SaleReturn & {
    items: { id: string; saleItemId: string; quantity: number; refundAmount: number }[];
    createdBy: { name: string };
  })[];
  branch: { name: string };
  createdBy: { name: string };
}

export interface SaleListItem extends Sale {
  payments: { amount: number; account: { name: string } }[];
  _count: { items: number };
}

export interface SaleListResult {
  sales: SaleListItem[];
  total: number;
  page: number;
  limit: number;
}

const SALE_INCLUDE = {
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
} satisfies Prisma.SaleInclude;

function isUniqueViolation(err: unknown, field: string): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    JSON.stringify(err.meta ?? {}).includes(field)
  );
}

/** Tenant + per-member branch access (and, for writes, an ACTIVE branch). */
async function requireBranchInBusiness(
  ctx: TenantContext,
  branchId: string,
  opts: { write?: boolean } = {},
) {
  return requireBranchAccess(ctx, branchId, opts);
}

// ─── Receipt numbers ───────────────────────────────────────

/**
 * Receipt number: BRN-YYYYMMDD-NNNN, numbered per branch per *local* business
 * day. Must run inside the branch lock (see createSale) to be race-free.
 */
async function generateReceiptNumber(
  tx: Tx,
  branchId: string,
  offsetMinutes: number,
): Promise<string> {
  const dayKey = businessDayKey(new Date(), offsetMinutes);
  const count = await tx.sale.count({
    where: {
      branchId,
      createdAt: {
        gte: startOfBusinessDay(dayKey, offsetMinutes),
        lte: endOfBusinessDay(dayKey, offsetMinutes),
      },
    },
  });
  return `BRN-${dayKey.replace(/-/g, "")}-${String(count + 1).padStart(4, "0")}`;
}

// ─── Create sale ───────────────────────────────────────────

/** Existing sale for an idempotency key, verified to belong to this business. */
async function findIdempotentSale(
  tx: Tx,
  syncOperationId: string,
  businessId: string,
): Promise<SaleWithDetails | null> {
  const existing = await tx.sale.findUnique({
    where: { syncOperationId },
    include: SALE_INCLUDE,
  });
  if (!existing) return null;
  const branch = await tx.branch.findUnique({ where: { id: existing.branchId } });
  if (!branch || branch.businessId !== businessId) {
    // The key exists but belongs to someone else: never reveal or return it.
    throw appError.conflict("This operation id has already been used.");
  }
  return existing;
}

export async function createSale(
  ctx: TenantContext,
  input: CreateSaleInput,
): Promise<SaleWithDetails> {
  const branchId = input.branchId;
  // Verify tenancy BEFORE taking a lock so a hostile caller cannot hold locks
  // on another tenant's branch.
  await requireBranchInBusiness(ctx, branchId, { write: true });
  const { currency, offsetMinutes } = await getBusinessTime(ctx.businessId);

  try {
    return await prisma.$transaction(
      async (tx): Promise<SaleWithDetails> => {
        await lockKey(tx, `branch-sales:${branchId}`);

        // Idempotency first, so a retried sale never trips the plan limit.
        if (input.syncOperationId) {
          const existing = await findIdempotentSale(tx, input.syncOperationId, ctx.businessId);
          if (existing) return existing;
        }

        // Entitlements (server-side): active subscription + monthly cap.
        await assertWithinLimit(ctx, LIMIT_KEYS.MAX_TRANSACTIONS_MONTH, async () => {
          const monthStart = startOfBusinessDay(
            `${businessDayKey(new Date(), offsetMinutes).slice(0, 8)}01`,
            offsetMinutes,
          );
          return tx.sale.count({
            where: { branch: { businessId: ctx.businessId }, createdAt: { gte: monthStart }, deletedAt: null },
          });
        });

        const branch = await tx.branch.findUnique({ where: { id: branchId } });
        if (!branch || branch.businessId !== ctx.businessId || branch.status !== "ACTIVE") {
          throw appError.tenantViolation("Branch does not belong to this business.");
        }

        const account = await tx.financialAccount.findUnique({ where: { id: input.accountId } });
        if (!account || account.businessId !== ctx.businessId || account.status !== "ACTIVE") {
          throw appError.invalidAccount("Payment account not found or inactive.");
        }

        // Load every product in ONE query, scoped to this business.
        const productIds = [...new Set(input.items.map((i) => i.productId))];
        const rows = await tx.product.findMany({
          where: { id: { in: productIds }, businessId: ctx.businessId },
        });
        const pricing = new Map<string, ProductPricing>();
        for (const p of rows) {
          if (p.status === "ARCHIVED") {
            throw appError.validationError(`Product "${p.name}" is archived.`);
          }
          pricing.set(p.id, {
            id: p.id,
            name: p.name,
            sku: p.sku,
            sellingPrice: p.sellingPrice,
            costPrice: p.costPrice,
          });
        }

        let computed;
        try {
          computed = computeSale({
            items: input.items,
            saleDiscount: input.discountAmount,
            products: pricing,
            canOverridePrice: canApplyPriceOverride(ctx),
            currency,
          });
        } catch (err) {
          if (err instanceof SaleMathError) throw appError.validationError(err.message);
          throw err;
        }

        const sale = await tx.sale.create({
          data: {
            branchId,
            createdById: ctx.userId,
            status: "COMPLETED",
            subtotal: computed.subtotal,
            discountAmount: computed.saleDiscount,
            finalTotal: computed.finalTotal,
            receiptNumber: await generateReceiptNumber(tx, branchId, offsetMinutes),
            syncOperationId: input.syncOperationId ?? null,
            notes: input.notes ?? null,
          },
        });

        await tx.saleItem.createMany({
          data: computed.lines.map((l) => ({
            saleId: sale.id,
            productId: l.productId,
            productName: l.productName, // snapshot
            productSku: l.productSku, // snapshot
            unitPrice: l.unitPrice, // snapshot
            unitCost: l.unitCost, // snapshot
            quantity: l.quantity,
            discountAmount: l.discountAmount,
            lineTotal: l.lineTotal,
          })),
        });

        // Stock: one guarded decrement per product, using the merged quantity
        // so the same product on two lines cannot bypass the check.
        const perProduct = totalQuantityByProduct(computed.lines);
        for (const [productId, qty] of perProduct) {
          const name = pricing.get(productId)?.name ?? productId;
          await decrementStock(tx, productId, branchId, qty, name);
        }
        await tx.inventoryMovement.createMany({
          data: computed.lines.map((l) => ({
            productId: l.productId,
            branchId,
            createdById: ctx.userId,
            type: "SALE" as const,
            quantity: -l.quantity,
            unitCost: l.unitCost,
            referenceId: sale.id,
            referenceType: "Sale",
          })),
        });

        // A sale is paid in full into the chosen account. Note: this RECORDS
        // the payment method; it does not verify any electronic payment.
        await tx.payment.create({
          data: { saleId: sale.id, accountId: account.id, amount: computed.finalTotal },
        });
        if (computed.finalTotal > 0) {
          await creditAccount(tx, account.id, computed.finalTotal, "SALE_PAYMENT", {
            referenceId: sale.id,
            referenceType: "Sale",
          });
        }

        return tx.sale.findUniqueOrThrow({ where: { id: sale.id }, include: SALE_INCLUDE });
      },
      { timeout: 15_000 },
    );
  } catch (err) {
    // Two identical submissions racing past the lock (e.g. different branch
    // ids is impossible, but a retry after a lost response is common): the
    // unique index is the final guard — return the winner, don't fail.
    if (input.syncOperationId && isUniqueViolation(err, "syncOperationId")) {
      const winner = await prisma.sale.findUnique({
        where: { syncOperationId: input.syncOperationId },
        include: SALE_INCLUDE,
      });
      if (winner) {
        await requireBranchInBusiness(ctx, winner.branchId);
        return winner;
      }
    }
    throw err;
  }
}

// ─── Reads ─────────────────────────────────────────────────

/** Load a single sale with full details. Enforces tenant ownership. */
export async function getSale(ctx: TenantContext, saleId: string): Promise<SaleWithDetails> {
  const sale = await prisma.sale.findUnique({ where: { id: saleId }, include: SALE_INCLUDE });
  if (!sale) throw appError.notFound("Sale not found.");
  await requireBranchInBusiness(ctx, sale.branchId);
  return sale;
}

/** List sales for a branch. Date filters are interpreted as business-local days. */
export async function listSales(
  ctx: TenantContext,
  filters: SaleFilterInput,
): Promise<SaleListResult> {
  const branchId = filters.branchId ?? ctx.branchId;
  if (!branchId) throw appError.validationError("Branch is required.");
  await requireBranchInBusiness(ctx, branchId);
  const { offsetMinutes } = await getBusinessTime(ctx.businessId);

  const fromDate = filters.from
    ? isDayKey(filters.from)
      ? startOfBusinessDay(filters.from, offsetMinutes)
      : new Date(filters.from)
    : null;
  const toDate = filters.to
    ? isDayKey(filters.to)
      ? endOfBusinessDay(filters.to, offsetMinutes)
      : new Date(filters.to)
    : null;

  const where: Prisma.SaleWhereInput = {
    branchId,
    deletedAt: null,
    ...(filters.status ? { status: filters.status } : {}),
    ...(fromDate || toDate
      ? {
          createdAt: {
            ...(fromDate && !Number.isNaN(fromDate.getTime()) ? { gte: fromDate } : {}),
            ...(toDate && !Number.isNaN(toDate.getTime()) ? { lte: toDate } : {}),
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

// ─── Returns ───────────────────────────────────────────────

/**
 * Create a sale return atomically.
 *
 * Refund per item = the customer's NET payment for that item (line total less
 * its share of the sale-level discount), pro-rated by quantity with
 * cumulative rounding — so total refunds can never exceed what was paid, and
 * returning everything refunds exactly the sale's final total.
 *
 * Restockable items add stock back via exactly one SALE_RETURN movement;
 * damaged items do not. One REFUND ledger entry is written per return.
 * Idempotent via syncOperationId.
 */
export async function createReturn(
  ctx: TenantContext,
  saleId: string,
  input: CreateReturnInput,
): Promise<SaleReturn> {
  requireOwnerOrManager(ctx);

  // Tenant check before locking.
  const head = await prisma.sale.findUnique({
    where: { id: saleId },
    select: { branchId: true },
  });
  if (!head) throw appError.notFound("Sale not found.");
  await requireBranchInBusiness(ctx, head.branchId);

  const seen = new Set<string>();
  for (const it of input.items) {
    if (seen.has(it.saleItemId)) {
      throw appError.validationError("Each sale item may appear only once per return.");
    }
    seen.add(it.saleItemId);
  }

  return prisma.$transaction(
    async (tx) => {
      await lockKey(tx, `sale-return:${saleId}`);

      if (input.syncOperationId) {
        const existing = await tx.saleReturn.findUnique({
          where: { syncOperationId: input.syncOperationId },
        });
        if (existing) {
          if (existing.saleId !== saleId) {
            throw appError.conflict("This operation id has already been used.");
          }
          return existing;
        }
      }

      // Re-read under the lock so concurrent returns see each other.
      const sale = await tx.sale.findUnique({
        where: { id: saleId },
        include: { items: true, returns: { include: { items: true } } },
      });
      if (!sale) throw appError.notFound("Sale not found.");
      if (sale.status === "VOIDED" || sale.status === "RETURNED") {
        throw appError.validationError("This sale cannot be returned.");
      }

      const refundAccount = await tx.financialAccount.findUnique({
        where: { id: input.refundAccountId },
      });
      if (
        !refundAccount ||
        refundAccount.businessId !== ctx.businessId ||
        refundAccount.status !== "ACTIVE"
      ) {
        throw appError.invalidAccount("Refund account not found or inactive.");
      }

      const alreadyReturned = new Map<string, number>();
      for (const ret of sale.returns) {
        for (const ri of ret.items) {
          alreadyReturned.set(ri.saleItemId, (alreadyReturned.get(ri.saleItemId) ?? 0) + ri.quantity);
        }
      }

      // What each line actually cost the customer, after the sale discount.
      const allocations = allocateSaleDiscount(
        sale.items.map((i) => i.lineTotal),
        sale.discountAmount,
      );
      const netPaid = new Map(
        sale.items.map((item, idx) => [item.id, lineNetPaid(item.lineTotal, allocations[idx] ?? 0)]),
      );

      const computed: {
        saleItem: (typeof sale.items)[number];
        quantity: number;
        refundAmount: number;
        stockDisposition: "RESTOCK" | "DAMAGED";
      }[] = [];
      let totalRefund = 0;

      for (const ri of input.items) {
        const saleItem = sale.items.find((si) => si.id === ri.saleItemId);
        if (!saleItem) throw appError.validationError(`Sale item ${ri.saleItemId} not found.`);

        const prev = alreadyReturned.get(saleItem.id) ?? 0;
        const maxReturnable = saleItem.quantity - prev;
        if (ri.quantity > maxReturnable) {
          throw appError.invalidReturn(
            `Cannot return ${ri.quantity} of "${saleItem.productName}". Max returnable: ${maxReturnable}.`,
          );
        }

        const refundAmount = refundForReturn(
          netPaid.get(saleItem.id) ?? 0,
          saleItem.quantity,
          prev,
          ri.quantity,
        );
        computed.push({
          saleItem,
          quantity: ri.quantity,
          refundAmount,
          stockDisposition: ri.stockDisposition,
        });
        totalRefund += refundAmount;
      }

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
            create: computed.map((c) => ({
              saleItemId: c.saleItem.id,
              quantity: c.quantity,
              refundAmount: c.refundAmount,
              stockDisposition: c.stockDisposition,
            })),
          },
        },
      });

      // Restock sellable units: exactly one movement + one increment each.
      for (const c of computed) {
        if (c.stockDisposition !== "RESTOCK") continue;
        await tx.inventoryMovement.create({
          data: {
            productId: c.saleItem.productId,
            branchId: sale.branchId,
            createdById: ctx.userId,
            type: "SALE_RETURN",
            quantity: c.quantity,
            unitCost: c.saleItem.unitCost,
            referenceId: saleReturn.id,
            referenceType: "SaleReturn",
          },
        });
        await incrementStock(tx, c.saleItem.productId, sale.branchId, c.quantity);
      }

      if (totalRefund > 0) {
        await debitAccount(tx, refundAccount.id, totalRefund, "REFUND", refundAccount.name, {
          referenceId: saleReturn.id,
          referenceType: "SaleReturn",
        });
      }

      // Fully returned = every unit of every line has been returned.
      const allReturned = sale.items.every((item) => {
        const nowReturned =
          (alreadyReturned.get(item.id) ?? 0) +
          (computed.find((c) => c.saleItem.id === item.id)?.quantity ?? 0);
        return nowReturned >= item.quantity;
      });
      await tx.sale.update({
        where: { id: sale.id },
        data: { status: allReturned ? "RETURNED" : "PARTIALLY_RETURNED" },
      });

      return saleReturn;
    },
    { timeout: 15_000 },
  );
}
