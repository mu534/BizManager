/**
 * Maps a service error to a sync result — pure. Shared by the sync route and its tests.
 *
 *  SUBSCRIPTION_LIMIT   → HELD      (clears once the subscription is renewed)
 *  business-rule errors → CONFLICT  (cannot succeed on retry; needs the user)
 *  everything else      → FAILED    (treated as transient; retried with backoff)
 */
import { AppErrorCode } from "./errors";

export type SyncResultStatus = "SYNCED" | "CONFLICT" | "FAILED" | "DUPLICATE" | "HELD";

const TERMINAL_CODES: ReadonlySet<string> = new Set([
  AppErrorCode.INSUFFICIENT_STOCK,
  AppErrorCode.VALIDATION_ERROR,
  AppErrorCode.INVALID_ACCOUNT,
  AppErrorCode.TENANT_VIOLATION,
  AppErrorCode.FORBIDDEN,
  AppErrorCode.CONFLICT,
  AppErrorCode.NOT_FOUND,
]);

export function classifyServiceError(code: string): Exclude<SyncResultStatus, "SYNCED" | "DUPLICATE"> {
  if (code === AppErrorCode.SUBSCRIPTION_LIMIT) return "HELD";
  return TERMINAL_CODES.has(code) ? "CONFLICT" : "FAILED";
}
