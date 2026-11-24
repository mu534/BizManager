"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/** Last-resort error page: replaces the whole document when the root layout itself fails. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // No-op unless monitoring is configured; the event is scrubbed before it is sent.
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", minHeight: "100vh", placeItems: "center", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 20, margin: 0 }}>Something went wrong</h1>
          <p style={{ color: "#555" }}>Your data is safe. Please try again.</p>
          <button
            onClick={reset}
            style={{ marginTop: 12, padding: "10px 18px", borderRadius: 10, border: 0, background: "#0b7f6d", color: "white", fontSize: 15 }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}