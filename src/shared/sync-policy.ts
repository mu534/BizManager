/**
 * Offline queue state machine — pure, no I/O, no clock access.
 *
 * Decides what happens to a queued operation after each delivery attempt.
 * Principles:
 *  - A queued operation is NEVER deleted by policy. The only ways out of the
 *    queue are server acknowledgement ("synced") or an explicit, confirmed user
 *    decision ("discarded").
 *  - Connectivity problems are not the operation's fault: they never consume
 *    retries and never escalate.
 *  - A subscription restriction is not a data conflict: the operation is HELD
 *    and resumes by itself once the subscription is active again.
 *  - Business-rule rejections (insufficient stock, permission removed, invalid
 *    data…) become "conflict": kept, explained, and recoverable by the user.
 *  - Repeated server-side failures escalate to "failed" (still recoverable).
 */

export type QueueStatus =
  | "pending"
  | "submitting"
  | "synced"
  | "conflict"
  | "failed"
  | "held"
  | "discarded";

export type ResultStatus = "SYNCED" | "DUPLICATE" | "CONFLICT" | "FAILED" | "HELD";

export type SyncOutcome =
  | { kind: "network" }
  | { kind: "unauthenticated" }
  | { kind: "http"; status: number }
  | { kind: "missing-result" }
  | { kind: "result"; status: ResultStatus; code?: string; message?: string };

export interface QueueState {
  status: QueueStatus;
  retryCount: number;
  /** Unix ms — do not attempt before this time. */
  retryAt: number;
  lastError: string | null;
  /** Machine-readable reason so the UI can tell causes apart. */
  lastErrorCode: string | null;
}

/** Server-side failures tolerated before an item is flagged "failed". */
export const MAX_RETRIES = 8;
export const NETWORK_RETRY_MS = 30_000;
export const AUTH_RETRY_MS = 60_000;
export const HELD_RETRY_MS = 5 * 60_000;
const MAX_BACKOFF_MS = 60 * 60_000;

export function backoffMs(retryCount: number): number {
  return Math.min(30_000 * Math.pow(2, retryCount), MAX_BACKOFF_MS);
}

/** Statuses a processing run may pick up when `retryAt` has passed. */
export function isDeliverable(status: QueueStatus): boolean {
  return status === "pending" || status === "held";
}

/** Statuses that need the shopkeeper to look at them. */
export function needsAttention(status: QueueStatus): boolean {
  return status === "conflict" || status === "failed";
}

function retryOrFail(prev: { retryCount: number }, now: number, message: string, code: string): QueueState {
  const retryCount = prev.retryCount + 1;
  if (retryCount >= MAX_RETRIES) {
    return { status: "failed", retryCount, retryAt: now + MAX_BACKOFF_MS, lastError: message, lastErrorCode: code };
  }
  return { status: "pending", retryCount, retryAt: now + backoffMs(retryCount), lastError: message, lastErrorCode: code };
}

export function nextQueueState(prev: { retryCount: number }, outcome: SyncOutcome, now: number): QueueState {
  switch (outcome.kind) {
    case "network":
      return {
        status: "pending",
        retryCount: prev.retryCount,
        retryAt: now + NETWORK_RETRY_MS,
        lastError: "No connection. Saved on this device and will sync automatically.",
        lastErrorCode: "NETWORK",
      };
    case "unauthenticated":
      return {
        status: "pending",
        retryCount: prev.retryCount,
        retryAt: now + AUTH_RETRY_MS,
        lastError: "Sign in again to sync.",
        lastErrorCode: "AUTH",
      };
    case "http":
      return retryOrFail(prev, now, `The server could not process this (HTTP ${outcome.status}).`, "HTTP");
    case "missing-result":
      return retryOrFail(prev, now, "The server did not confirm this item.", "NO_RESULT");
    case "result":
      switch (outcome.status) {
        case "SYNCED":
        case "DUPLICATE":
          return { status: "synced", retryCount: prev.retryCount, retryAt: 0, lastError: null, lastErrorCode: null };
        case "HELD":
          return {
            status: "held",
            retryCount: prev.retryCount,
            retryAt: now + HELD_RETRY_MS,
            lastError: outcome.message ?? "Paused until the subscription is active.",
            lastErrorCode: outcome.code ?? "SUBSCRIPTION_LIMIT",
          };
        case "CONFLICT":
          return {
            status: "conflict",
            retryCount: prev.retryCount,
            retryAt: 0,
            lastError: outcome.message ?? "The server could not apply this safely.",
            lastErrorCode: outcome.code ?? "CONFLICT",
          };
        case "FAILED":
          return retryOrFail(prev, now, outcome.message ?? "Server error", outcome.code ?? "SERVER_ERROR");
      }
  }
}

/** A user-requested retry restarts delivery with a clean slate (same operation id). */
export function manualRetryState(): QueueState {
  return { status: "pending", retryCount: 0, retryAt: 0, lastError: null, lastErrorCode: null };
}

export interface QueueSummary {
  pending: number;
  submitting: number;
  held: number;
  needsAttention: number;
}

export function summarizeQueue(statuses: readonly QueueStatus[]): QueueSummary {
  const s: QueueSummary = { pending: 0, submitting: 0, held: 0, needsAttention: 0 };
  for (const st of statuses) {
    if (st === "pending") s.pending += 1;
    else if (st === "submitting") s.submitting += 1;
    else if (st === "held") s.held += 1;
    else if (needsAttention(st)) s.needsAttention += 1;
  }
  return s;
}
