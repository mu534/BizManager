/**
 * Error-monitoring rules shared by the server and the browser. Pure and unit-tested.
 *
 * Privacy first: shops' sales and customers' details must never reach a third-party
 * error tracker. Events are stripped of cookies, headers, request bodies, query
 * strings and user details before leaving the machine; only the error and its stack
 * trace are kept.
 */
import { isAppError } from "./errors";

/** Expected, user-caused failures (validation, permissions, not found) are not bugs. */
export function shouldDropError(err: unknown): boolean {
  if (isAppError(err)) return err.statusCode < 500;
  const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest?: unknown }).digest) : "";
  // Next.js control-flow signals thrown by redirect() and notFound().
  return digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK") || digest === "NEXT_NOT_FOUND";
}

interface ScrubbableEvent {
  user?: unknown;
  request?: { url?: string; method?: string; headers?: unknown; cookies?: unknown; data?: unknown; query_string?: unknown };
  extra?: unknown;
  contexts?: Record<string, unknown>;
  breadcrumbs?: unknown;
  server_name?: string;
}

/** Removes everything that could identify a shop, a customer or a session. */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  delete event.user;
  delete event.extra;
  delete event.breadcrumbs;
  delete event.server_name;
  if (event.contexts) delete event.contexts.device;
  if (event.request) {
    const { method } = event.request;
    // Keep the path only: ids in the path are random UUIDs, but query strings can hold search text.
    let path = event.request.url;
    try {
      if (path) path = new URL(path).pathname;
    } catch {
      path = undefined;
    }
    event.request = { method, url: path };
  }
  return event;
}

/** Options common to both runtimes. */
export const SENTRY_BASE_OPTIONS = {
  // Errors only. No performance tracing, session replay or log capture.
  tracesSampleRate: 0,
  sendDefaultPii: false,
  environment: process.env.NODE_ENV ?? "production",
} as const;