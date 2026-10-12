import { NextRequest, NextResponse } from "next/server";
import { resolveContext } from "@server/auth/resolve-context";
import { createSale } from "@server/services/sale.service";
import { recordExpense } from "@server/services/expense.service";
import { prisma } from "@server/db/prisma";
import { isAppError, AppErrorCode } from "@shared/errors";
import {
  syncBatchSchema,
  type SyncBatchInput,
  type SyncOperationResult,
  type SyncBatchResponse,
} from "@shared/validation/sync.schema";
import type { CreateSaleInput } from "@shared/validation/sale.schema";
import type { RecordExpenseInput } from "@shared/validation/expense.schema";

/**
 * POST /api/[businessId]/sync/batch
 *
 * Idempotent batch sync endpoint.
 *
 * Security rules:
 *  - Auth via session cookie (resolveContext) — NOT from client-supplied IDs.
 *  - businessId comes from the URL param, NEVER from the operation payload.
 *  - branchId is passed to resolveContext for verification, never used raw.
 *  - Max 50 operations per batch (enforced by Zod schema).
 *  - Per-operation idempotency via SyncOperation table.
 *
 * Response shape: { results: SyncOperationResult[] }
 * All operations are processed regardless of individual failure —
 * the client receives a result for every submitted operation.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ businessId: string }> },
): Promise<NextResponse> {
  const { businessId } = await params;

  // Parse and validate the request body.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" } },
      { status: 400 },
    );
  }

  const parsed = syncBatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid sync batch",
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 422 },
    );
  }

  const { clientId, operations } = parsed.data;

  // Resolve context ONCE for the entire batch using the URL businessId.
  // This is the primary auth gate — cross-tenant ops are rejected here.
  let ctx;
  try {
    ctx = await resolveContext(businessId);
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json(err.toSafeJSON(), { status: err.statusCode });
    }
    console.error("[POST /api/[businessId]/sync/batch] resolveContext failed", err);
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: "Authentication failed." } },
      { status: 500 },
    );
  }

  const results: SyncOperationResult[] = [];

  for (const op of operations) {
    const result = await processSyncOperation(ctx, businessId, clientId, op);
    results.push(result);
  }

  const response: SyncBatchResponse = { results };
  return NextResponse.json(response);
}

// ─── Per-operation processor ──────────────────────────────────────────────────

type TenantCtx = Awaited<ReturnType<typeof resolveContext>>;
type SyncOp = SyncBatchInput["operations"][number];

async function processSyncOperation(
  ctx: TenantCtx,
  businessId: string,
  clientId: string,
  op: SyncOp,
): Promise<SyncOperationResult> {
  try {
    // 1. Idempotency check — if this syncOperationId was already processed,
    //    return the stored result without re-applying the operation.
    const existing = await prisma.syncOperation.findUnique({
      where: { syncOperationId: op.syncOperationId },
    });

    if (existing) {
      return {
        syncOperationId: op.syncOperationId,
        status: "DUPLICATE",
        entityId: existing.entityId,
      };
    }

    // 2. Validate schema version — reject unsupported versions.
    if (op.schemaVersion !== 1) {
      return {
        syncOperationId: op.syncOperationId,
        status: "FAILED",
        error: {
          code: "VALIDATION_ERROR",
          message: `Unsupported schema version: ${String(op.schemaVersion)}`,
        },
      };
    }

    // 3. Dispatch to the appropriate service.
    if (op.entityType === "SALE") {
      return await processSaleOperation(ctx, businessId, clientId, op);
    } else {
      return await processExpenseOperation(ctx, businessId, clientId, op);
    }
  } catch (err) {
    // Catch any unexpected error — never expose internals.
    console.error(
      `[sync/batch] Unexpected error for op ${op.syncOperationId}:`,
      err,
    );
    return {
      syncOperationId: op.syncOperationId,
      status: "FAILED",
      error: { code: "SERVER_ERROR", message: "An unexpected error occurred." },
    };
  }
}

// ─── Sale operation ──────────────────────────────────────────────────────────

async function processSaleOperation(
  ctx: TenantCtx,
  businessId: string,
  clientId: string,
  op: Extract<SyncOp, { entityType: "SALE" }>,
): Promise<SyncOperationResult> {
  const payload = op.payload;

  // Re-derive the verified branchId via resolveContext.
  // The payload branchId is used ONLY to verify it belongs to this business.
  // We never use it for auth — resolveContext enforces tenant isolation.
  let branchCtx: TenantCtx;
  try {
    branchCtx = await resolveContext(businessId, payload.branchId);
  } catch (err) {
    if (isAppError(err)) {
      return {
        syncOperationId: op.syncOperationId,
        status: "FAILED",
        error: { code: err.code, message: err.message },
      };
    }
    return {
      syncOperationId: op.syncOperationId,
      status: "FAILED",
      error: { code: "SERVER_ERROR", message: "Branch verification failed." },
    };
  }

  // Build the CreateSaleInput — branchId comes from verified context.
  const saleInput: CreateSaleInput = {
    branchId: branchCtx.branchId ?? payload.branchId,
    items: payload.items,
    discountAmount: payload.discountAmount ?? "0",
    accountId: payload.accountId,
    notes: payload.notes,
    syncOperationId: op.syncOperationId,
  };

  try {
    const sale = await createSale(branchCtx, saleInput);

    // Record the sync operation for idempotency.
    await prisma.syncOperation.create({
      data: {
        syncOperationId: op.syncOperationId,
        clientId,
        userId: ctx.userId,
        businessId,
        entityType: "SALE",
        entityId: sale.id,
        operationType: "CREATE",
        payload: payload as object,
        status: "ACKNOWLEDGED",
        processedAt: new Date(),
      },
    });

    return {
      syncOperationId: op.syncOperationId,
      status: "SYNCED",
      entityId: sale.id,
    };
  } catch (err) {
    if (isAppError(err)) {
      if (err.code === AppErrorCode.INSUFFICIENT_STOCK) {
        // Return CONFLICT — never discard the local sale.
        return {
          syncOperationId: op.syncOperationId,
          status: "CONFLICT",
          error: { code: err.code, message: err.message },
        };
      }
      // Idempotency: if the sale was already created (syncOperationId unique constraint),
      // the service returns it. But if createSale threw for another reason, mark FAILED.
      return {
        syncOperationId: op.syncOperationId,
        status: "FAILED",
        error: { code: err.code, message: err.message },
      };
    }
    console.error("[sync/batch] Sale creation error:", err);
    return {
      syncOperationId: op.syncOperationId,
      status: "FAILED",
      error: { code: "SERVER_ERROR", message: "Sale creation failed." },
    };
  }
}

// ─── Expense operation ───────────────────────────────────────────────────────

async function processExpenseOperation(
  ctx: TenantCtx,
  businessId: string,
  clientId: string,
  op: Extract<SyncOp, { entityType: "EXPENSE" }>,
): Promise<SyncOperationResult> {
  const payload = op.payload;

  // Re-derive the verified branchId via resolveContext.
  let branchCtx: TenantCtx;
  try {
    branchCtx = await resolveContext(businessId, payload.branchId);
  } catch (err) {
    if (isAppError(err)) {
      return {
        syncOperationId: op.syncOperationId,
        status: "FAILED",
        error: { code: err.code, message: err.message },
      };
    }
    return {
      syncOperationId: op.syncOperationId,
      status: "FAILED",
      error: { code: "SERVER_ERROR", message: "Branch verification failed." },
    };
  }

  const expenseInput: RecordExpenseInput = {
    branchId: branchCtx.branchId ?? payload.branchId,
    categoryId: payload.categoryId,
    accountId: payload.accountId,
    amount: payload.amount,
    description: payload.description,
    expenseDate: payload.expenseDate,
    syncOperationId: op.syncOperationId,
  };

  try {
    const expense = await recordExpense(branchCtx, expenseInput);

    // Record the sync operation for idempotency.
    await prisma.syncOperation.create({
      data: {
        syncOperationId: op.syncOperationId,
        clientId,
        userId: ctx.userId,
        businessId,
        entityType: "EXPENSE",
        entityId: expense.id,
        operationType: "CREATE",
        payload: payload as object,
        status: "ACKNOWLEDGED",
        processedAt: new Date(),
      },
    });

    return {
      syncOperationId: op.syncOperationId,
      status: "SYNCED",
      entityId: expense.id,
    };
  } catch (err) {
    if (isAppError(err)) {
      return {
        syncOperationId: op.syncOperationId,
        status: "FAILED",
        error: { code: err.code, message: err.message },
      };
    }
    console.error("[sync/batch] Expense creation error:", err);
    return {
      syncOperationId: op.syncOperationId,
      status: "FAILED",
      error: { code: "SERVER_ERROR", message: "Expense creation failed." },
    };
  }
}
