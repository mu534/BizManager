import * as Sentry from "@sentry/nextjs";
import { SENTRY_BASE_OPTIONS, scrubEvent, shouldDropError } from "@shared/monitoring";

/**
 * Server-side error monitoring. Does nothing unless SENTRY_DSN is set, so local
 * development and any environment without a Sentry project are unaffected.
 */
export async function register(): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      ...SENTRY_BASE_OPTIONS,
      dsn,
      beforeSend(event, hint) {
        return shouldDropError(hint.originalException) ? null : scrubEvent(event);
      },
    });
  }
}

// Reports errors thrown while rendering pages and running routes and server actions.
export const onRequestError = Sentry.captureRequestError;