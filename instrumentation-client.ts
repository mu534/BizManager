import * as Sentry from "@sentry/nextjs";
import { SENTRY_BASE_OPTIONS, scrubEvent, shouldDropError } from "@shared/monitoring";

/** Browser-side error monitoring. Off unless NEXT_PUBLIC_SENTRY_DSN is set. */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    ...SENTRY_BASE_OPTIONS,
    dsn,
    beforeSend(event, hint) {
      return shouldDropError(hint.originalException) ? null : scrubEvent(event);
    },
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;