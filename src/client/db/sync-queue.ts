"use client";

/**
 * Sync queue processor.
 *
 *  - enqueueOperation: persist a SyncQueueItem to IndexedDB (durable).
 *  - processQueue: deliver due items to POST /api/[businessId]/sync/batch and
 *    apply each outcome through the pure state machine in @shared/sync-policy.
 *  - retryItem / discardItem: the user-facing recovery actions.
 *  - startSyncProcessor: run on an interval and when connectivity returns.
 *
 * Safety rules:
 *  - syncOperationId is NEVER regenerated; every delivery attempt reuses it, so
 *    the server's idempotency makes retries harmless.
 *  - An item only leaves the queue by server acknowledgement or an explicit,
 *    confirmed discard. Policy never deletes anything.
 *  - Connectivity failures never consume retries; subscription restrictions HOLD
 *    items (they resume after renewal) instead of flagging a data conflict.
 *  - Items are delivered oldest-first so e.g. a stock receipt reaches the server
 *    before the sale that depends on it.
 */

import { db, type SyncQueueItem, type SyncStatus } from "./dexie";
import {
  isDeliverable,
  manualRetryState,
  nextQueueState,
  type QueueState,
  type SyncOutcome,
} from "@shared/sync-policy";

/** Fields the caller must supply — the rest are filled in by enqueueOperation. */
export type EnqueueInput = Omit<
  SyncQueueItem,
  "id" | "status" | "retryCount" | "retryAt" | "lastError" | "lastErrorCode" | "createdAt"
>;

type SyncOpResult = {
  syncOperationId: string;
  status: "SYNCED" | "CONFLICT" | "FAILED" | "DUPLICATE" | "HELD";
  entityId?: string;
  error?: { code: string; message: string };
};

type BatchSyncResponse = { results: SyncOpResult[] };

let isProcessing = false;

/** Persist a new operation. Does NOT trigger processing — call processQueue. */
export async function enqueueOperation(item: EnqueueInput): Promise<void> {
  const queueItem: SyncQueueItem = {
    ...item,
    id: crypto.randomUUID(),
    status: "pending",
    retryCount: 0,
    retryAt: 0,
    lastError: null,
    lastErrorCode: null,
    createdAt: Date.now(),
  };
  await db.syncQueue.add(queueItem);
}

/** Mirror a queue transition onto the local sale/expense record the UI shows. */
async function mirrorToLocalRecord(item: SyncQueueItem, status: SyncStatus, entityId?: string): Promise<void> {
  if (item.entityType === "SALE") {
    await db.localSales
      .where("id")
      .equals(item.entityId)
      .modify({
        syncStatus: status,
        updatedAt: Date.now(),
        ...(entityId ? { serverSaleId: entityId } : {}),
      });
  } else if (item.entityType === "EXPENSE") {
    await db.localExpenses
      .where("id")
      .equals(item.entityId)
      .modify({
        syncStatus: status,
        ...(entityId ? { serverExpenseId: entityId } : {}),
      });
  }
}

async function applyState(item: SyncQueueItem, state: QueueState, entityId?: string): Promise<void> {
  await db.syncQueue.update(item.id, {
    status: state.status,
    retryCount: state.retryCount,
    retryAt: state.retryAt,
    lastError: state.lastError,
    lastErrorCode: state.lastErrorCode,
  });
  await mirrorToLocalRecord(item, state.status, entityId);
}

async function applyOutcome(item: SyncQueueItem, outcome: SyncOutcome, entityId?: string): Promise<void> {
  await applyState(item, nextQueueState(item, outcome, Date.now()), entityId);
}

/**
 * Deliver all due items for a business. Safe to call concurrently — a mutex lets
 * only one run execute at a time.
 */
export async function processQueue(businessId: string): Promise<void> {
  if (isProcessing) return;
  // Don't burn an attempt when the browser already knows it has no connection.
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  isProcessing = true;

  try {
    const now = Date.now();

    // Recovery: a previous run that died mid-request (tab closed, crash) leaves
    // items stuck in "submitting". We hold the mutex, so none are ours in flight.
    // Re-delivering is harmless because the server is idempotent.
    const stuck = await db.syncQueue.where("[businessId+status]").equals([businessId, "submitting"]).toArray();
    for (const s of stuck) await db.syncQueue.update(s.id, { status: "pending" });

    const candidates = await db.syncQueue
      .where("[businessId+status]")
      .anyOf([
        [businessId, "pending"],
        [businessId, "held"],
      ])
      .toArray();

    const due = candidates
      .filter((i) => isDeliverable(i.status) && i.retryAt <= now)
      .sort((a, b) => a.createdAt - b.createdAt);
    if (due.length === 0) return;

    const batch = due.slice(0, 50);
    for (const item of batch) await db.syncQueue.update(item.id, { status: "submitting" });

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
        const outcome: SyncOutcome =
          response.status === 401 ? { kind: "unauthenticated" } : { kind: "http", status: response.status };
        for (const item of batch) await applyOutcome(item, outcome);
        return;
      }
      results = ((await response.json()) as BatchSyncResponse).results ?? [];
    } catch {
      // fetch threw: no connectivity (or the response was unreadable). Not the
      // operations' fault — keep them pending without consuming retries.
      for (const item of batch) await applyOutcome(item, { kind: "network" });
      return;
    }

    for (const item of batch) {
      const result = results.find((r) => r.syncOperationId === item.syncOperationId);
      if (!result) {
        await applyOutcome(item, { kind: "missing-result" });
        continue;
      }
      await applyOutcome(
        item,
        { kind: "result", status: result.status, code: result.error?.code, message: result.error?.message },
        result.entityId,
      );
    }
  } finally {
    isProcessing = false;
  }
}

// ─── Recovery actions (used by the sync-issues page) ─────────────────────────

/** Re-queue an item with the SAME operation id for immediate delivery. */
export async function retryItem(id: string): Promise<void> {
  const item = await db.syncQueue.get(id);
  if (!item || item.status === "synced" || item.status === "discarded") return;
  await applyState(item, manualRetryState());
}

/**
 * Stop syncing an item the user has decided not to send. The record stays on
 * the device (it is not deleted); it just leaves the queue. UI must confirm first.
 */
export async function discardItem(id: string): Promise<void> {
  const item = await db.syncQueue.get(id);
  if (!item || item.status === "synced") return;
  await db.syncQueue.update(id, { status: "discarded" });
  await mirrorToLocalRecord(item, "discarded");
}

/** Resolve after the item leaves pending/submitting, or after `timeoutMs`. */
export async function waitForOutcome(syncOperationId: string, timeoutMs = 4000): Promise<SyncQueueItem | undefined> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const item = await db.syncQueue.where("syncOperationId").equals(syncOperationId).first();
    if (!item || (item.status !== "pending" && item.status !== "submitting") || Date.now() >= deadline) return item;
    await new Promise((r) => setTimeout(r, 250));
  }
}

/** Run the processor on an interval and whenever connectivity returns. Returns a cleanup fn. */
export function startSyncProcessor(businessId: string): () => void {
  const interval = setInterval(() => void processQueue(businessId), 30_000);
  const trigger = () => void processQueue(businessId);
  window.addEventListener("online", trigger);
  document.addEventListener("visibilitychange", trigger);
  return () => {
    clearInterval(interval);
    window.removeEventListener("online", trigger);
    document.removeEventListener("visibilitychange", trigger);
  };
}
