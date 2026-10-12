import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Offline" };

/**
 * Offline fallback page — served by the service worker when navigation
 * fails and no cached version of the destination is available.
 */
export default function OfflinePage() {
  return (
    <div className="min-h-full flex flex-col items-center justify-center bg-gray-50 px-4 py-16 text-center">
      <div className="max-w-sm space-y-4">
        <div className="text-5xl">📶</div>
        <h1 className="text-xl font-semibold text-gray-900">You are offline</h1>
        <p className="text-sm text-gray-500">
          BizManager is working — your sales and expenses are saved locally and
          will sync automatically when connectivity returns.
        </p>
        <Link
          href="/app"
          className="inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Go to app
        </Link>
      </div>
    </div>
  );
}
