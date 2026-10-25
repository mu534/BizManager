"use client";

/**
 * Error boundary for the /app/* route segment.
 *
 * Next.js 16 passes `retry` (not `reset`) to re-attempt rendering.
 * error.message is intentionally NOT shown to users — it may leak
 * internal details. The stable `error.digest` (a short hash) is
 * safe to display and helps correlate logs without exposing internals.
 */
import { useEffect } from "react";

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  retry: () => void;
}

export default function AppErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    // Log to the browser console for developer debugging.
    // Do not send error.message to any external service here without
    // reviewing what it may contain.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <svg
          aria-hidden="true"
          className="h-12 w-12 text-red-500"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>

        <h1 className="text-xl font-semibold text-gray-900">
          Something went wrong
        </h1>

        {error.digest && (
          <p className="text-sm text-gray-500">
            Reference: <span className="font-mono">{error.digest}</span>
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          onClick={retry}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Try again
        </button>

        <a
          href="/app"
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Go to home
        </a>
      </div>
    </div>
  );
}
