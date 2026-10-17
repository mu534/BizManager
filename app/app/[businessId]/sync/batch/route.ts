import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { resolveContext } from "@server/auth/resolve-context";
import { getSessionUserId } from "@server/auth/session";
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
 * POST /api/[businessId]/sync/batch   (this file lives at sync/batch/route.ts;
 * it previously sat at sync/route.ts while the client posted to /sync/batch,
 * so every offline sync request 404ed)
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

  // Authenticate BEFORE looking at the body so anonymous callers learn nothing
  // about the payload schema. (Membership is verified by resolveContext below.)
  if (!(await getSessionUserId())) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Sign in to sync." } },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

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
      // The id is globally unique, so another tenant could submit it. Never
      // acknowledge (or reveal the entity id of) an operation that is not
      // this business's own.
      if (existing.businessId !== businessId) {
        return {
          syncOperationId: op.syncOperationId,
          status: "FAILED",
          error: { code: "CONFLICT", message: "This operation id has already been used." },
        };
      }
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

    // Record the sync operation for idempotency. upsert: a concurrent retry may
    // already have written it, and the sale itself is idempotent regardless.
    await recordSyncOperation({
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
    if (isAppError(err)) return failureResult(op.syncOperationId, err);
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

    // Record the sync operation for idempotency. upsert: a concurrent retry may
    // already have written it, and the sale itself is idempotent regardless.
    await recordSyncOperation({
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
    if (isAppError(err)) return failureResult(op.syncOperationId, err);
    console.error("[sync/batch] Expense creation error:", err);
    return {
      syncOperationId: op.syncOperationId,
      status: "FAILED",
      error: { code: "SERVER_ERROR", message: "Expense creation failed." },
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Business-rule rejections can never succeed on retry (insufficient stock,
 * plan limit, permissions, validation…). Report them as CONFLICT so the client
 * keeps the local record and asks the shopkeeper to resolve it, instead of
 * retrying with backoff. Anything else is treated as transient (FAILED).
 */
const TERMINAL_CODES: ReadonlySet<string> = new Set([
  AppErrorCode.INSUFFICIENT_STOCK,
  AppErrorCode.SUBSCRIPTION_LIMIT,
  AppErrorCode.VALIDATION_ERROR,
  AppErrorCode.INVALID_ACCOUNT,
  AppErrorCode.TENANT_VIOLATION,
  AppErrorCode.FORBIDDEN,
  AppErrorCode.CONFLICT,
  AppErrorCode.NOT_FOUND,
]);

function failureResult(
  syncOperationId: string,
  err: { code: string; message: string },
): SyncOperationResult {
  return {
    syncOperationId,
    status: TERMINAL_CODES.has(err.code) ? "CONFLICT" : "FAILED",
    error: { code: err.code, message: err.message },
  };
}

/** Idempotent insert: a concurrent retry may already have recorded it. */
async function recordSyncOperation(
  args: Parameters<typeof prisma.syncOperation.create>[0],
): Promise<void> {
  try {
    await prisma.syncOperation.create(args);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return;
    throw err;
  }
}
