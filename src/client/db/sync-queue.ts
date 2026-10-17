"use client";

/**
 * Sync queue processor.
 *
 * Responsibilities:
 *  - enqueueOperation: persist a SyncQueueItem to IndexedDB.
 *  - processQueue: read pending items and POST to /api/[businessId]/sync/batch,
 *    then update local records based on per-op results.
 *  - startSyncProcessor: run processQueue on a 30 s interval and on
 *    every window 'online' event. Returns a cleanup function.
 *
 * Safety rules enforced here:
 *  - syncOperationId is NEVER regenerated. The original client UUID is
 *    preserved across all retry attempts.
 *  - An isProcessing mutex prevents overlapping queue runs.
 *  - Exponential backoff: min(30000 * 2^retryCount, 3600000) ms.
 *  - After retryCount >= 5, transition to 'conflict' (needs human review).
 */

import { db, type SyncQueueItem, type SyncStatus } from "./dexie";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Fields the caller must supply — the rest are filled in by enqueueOperation. */
export type EnqueueInput = Omit<
  SyncQueueItem,
  "id" | "status" | "retryCount" | "retryAt" | "lastError" | "createdAt"
>;

type SyncOpResult = {
  syncOperationId: string;
  status: "SYNCED" | "CONFLICT" | "FAILED" | "DUPLICATE";
  entityId?: string;
  error?: { code: string; message: string };
};

type BatchSyncResponse = {
  results: SyncOpResult[];
};

// ─── Mutex ───────────────────────────────────────────────────────────────────

let isProcessing = false;

// ─── Backoff helper ──────────────────────────────────────────────────────────

function nextRetryAt(retryCount: number): number {
  const backoffMs = Math.min(30_000 * Math.pow(2, retryCount), 3_600_000);
  return Date.now() + backoffMs;
}

// ─── API ─────────────────────────────────────────────────────────────────────

/**
 * Persist a new sync operation to the queue.
 * Does NOT trigger processing — call processQueue separately.
 */
export async function enqueueOperation(item: EnqueueInput): Promise<void> {
  const queueItem: SyncQueueItem = {
    ...item,
    id: crypto.randomUUID(),
    status: "pending",
    retryCount: 0,
    retryAt: 0, // Process immediately on next run.
    lastError: null,
    createdAt: Date.now(),
  };
  await db.syncQueue.add(queueItem);
}

/**
 * Process all pending queue items for a business.
 *
 * Reads items with status='pending' and retryAt <= now, batches them
 * (max 50), POST to /api/[businessId]/sync/batch, and handles results.
 *
 * This function is idempotent and safe to call concurrently — the mutex
 * ensures only one run executes at a time.
 */
export async function processQueue(businessId: string): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const now = Date.now();

    // Recovery: if a previous run died mid-request (tab closed, crash) its items
    // are stuck in "submitting" and would never be picked up again. We hold the
    // in-process mutex, so none of OURS are in flight; re-queue them. A
    // duplicate submission is harmless — the server is idempotent per
    // syncOperationId.
    const stuck = await db.syncQueue
      .where("[businessId+status]")
      .equals([businessId, "submitting"])
      .toArray();
    if (stuck.length > 0) {
      await db.syncQueue.bulkPut(stuck.map((i) => ({ ...i, status: "pending" as SyncStatus })));
    }

    // Fetch pending items due for processing (retryAt <= now).
    const allPending = await db.syncQueue
      .where("[businessId+status]")
      .equals([businessId, "pending"])
      .toArray();

    const due = allPending.filter((item) => item.retryAt <= now);
    if (due.length === 0) return;

    // Process in batches of 50.
    const batch = due.slice(0, 50);

    // Mark as 'submitting' to prevent double-submission on slow networks.
    await db.syncQueue.bulkPut(
      batch.map((item) => ({ ...item, status: "submitting" as SyncStatus })),
    );

    let results: SyncOpResult[];

    try {
      const response = await fetch(`/api/${businessId}/sync/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: batch[0]?.clientId ?? "",
          operations: batch.map((item) => ({
            syncOperationId: item.syncOperationId,
            entityType: item.entityType,
            operationType: item.operationType,
            schemaVersion: item.schemaVersion,
            payload: item.payload,
          })),
        }),
      });

      if (!response.ok) {
        // Entire batch failed (e.g. auth error, 5xx).
        if (response.status === 401) {
          // Signed out / session expired: nothing is wrong with the data. Keep it
          // pending without burning retries so it syncs after the next sign-in.
          for (const item of batch) {
            await db.syncQueue.update(item.id, {
              status: "pending",
              retryAt: Date.now() + 60_000,
              lastError: "Sign in again to sync.",
            });
          }
          return;
        }
        const errorText = `HTTP ${response.status}`;
        await revertBatchToFailed(batch, errorText);
        return;
      }

      const body = (await response.json()) as BatchSyncResponse;
      results = body.results ?? [];
    } catch (networkError) {
      // Network error — revert all submitting items back to pending for retry.
      const errorMsg =
        networkError instanceof Error ? networkError.message : "Network error";
      await revertBatchToFailed(batch, errorMsg);
      return;
    }

    // Process per-operation results.
    for (const item of batch) {
      const result = results.find(
        (r) => r.syncOperationId === item.syncOperationId,
      );

      if (!result) {
        // No result returned — treat as failed.
        await handleItemFailed(item, "No result returned from server");
        continue;
      }

      switch (result.status) {
        case "SYNCED":
        case "DUPLICATE": {
          // Mark queue item as synced.
          await db.syncQueue.update(item.id, { status: "synced" });

          // Update the corresponding local record.
          if (item.entityType === "SALE") {
            await db.localSales
              .where("id")
              .equals(item.entityId)
              .modify({
                syncStatus: "synced",
                serverSaleId: result.entityId ?? null,
                updatedAt: Date.now(),
              });
          } else if (item.entityType === "EXPENSE") {
            await db.localExpenses
              .where("id")
              .equals(item.entityId)
              .modify({
                syncStatus: "synced",
                serverExpenseId: result.entityId ?? null,
              });
          }
          break;
        }

        case "CONFLICT": {
          // Server rejected (e.g. insufficient stock). Keep data, mark conflict.
          await db.syncQueue.update(item.id, {
            status: "conflict",
            lastError: result.error?.message ?? "Conflict on server",
          });
          if (item.entityType === "SALE") {
            await db.localSales
              .where("id")
              .equals(item.entityId)
              .modify({ syncStatus: "conflict", updatedAt: Date.now() });
          } else if (item.entityType === "EXPENSE") {
            await db.localExpenses
              .where("id")
              .equals(item.entityId)
              .modify({ syncStatus: "conflict" });
          }
          break;
        }

        case "FAILED": {
          await handleItemFailed(
            item,
            result.error?.message ?? "Server error",
          );
          break;
        }
      }
    }
  } finally {
    isProcessing = false;
  }
}

/** Revert submitting items back to pending with backoff after a batch-level failure. */
async function revertBatchToFailed(
  batch: SyncQueueItem[],
  errorMsg: string,
): Promise<void> {
  for (const item of batch) {
    await handleItemFailed(item, errorMsg);
  }
}

/** Increment retryCount and schedule backoff, or escalate to conflict. */
async function handleItemFailed(
  item: SyncQueueItem,
  errorMsg: string,
): Promise<void> {
  const newRetryCount = item.retryCount + 1;

  if (newRetryCount >= 5) {
    // Too many retries — needs human attention.
    await db.syncQueue.update(item.id, {
      status: "conflict",
      retryCount: newRetryCount,
      lastError: errorMsg,
    });
    if (item.entityType === "SALE") {
      await db.localSales
        .where("id")
        .equals(item.entityId)
        .modify({ syncStatus: "conflict", updatedAt: Date.now() });
    } else if (item.entityType === "EXPENSE") {
      await db.localExpenses
        .where("id")
        .equals(item.entityId)
        .modify({ syncStatus: "conflict" });
    }
  } else {
    // Schedule retry with bounded exponential backoff.
    await db.syncQueue.update(item.id, {
      status: "pending",
      retryCount: newRetryCount,
      retryAt: nextRetryAt(newRetryCount),
      lastError: errorMsg,
    });
    // Restore local record to pending so the UI shows "Waiting to sync".
    if (item.entityType === "SALE") {
      await db.localSales
        .where("id")
        .equals(item.entityId)
        .modify({ syncStatus: "pending", updatedAt: Date.now() });
    } else if (item.entityType === "EXPENSE") {
      await db.localExpenses
        .where("id")
        .equals(item.entityId)
        .modify({ syncStatus: "pending" });
    }
  }
}

/**
 * Start the background sync processor.
 *
 * - Calls processQueue every 30 seconds.
 * - Also calls processQueue immediately when the window 'online' event fires.
 *
 * @returns Cleanup function to stop the processor (call on component unmount).
 */
export function startSyncProcessor(businessId: string): () => void {
  const interval = setInterval(() => {
    void processQueue(businessId);
  }, 30_000);

  function onOnline() {
    void processQueue(businessId);
  }

  window.addEventListener("online", onOnline);

  return () => {
    clearInterval(interval);
    window.removeEventListener("online", onOnline);
  };
}
