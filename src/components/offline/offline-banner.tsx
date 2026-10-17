"use client";

/**
 * OfflineBanner — sticky connectivity and sync-status indicator.
 *
 * Displays:
 *  - Gray banner when device is offline with no pending ops.
 *  - Amber banner when online but there are pending/failed ops.
 *  - Green flash when actively syncing (submitting ops present).
 *  - A "Sync now" button triggers processQueue for the current business.
 *
 * Sync states shown to the user:
 *  "Saved locally" | "Waiting to sync" | "Synchronizing..." |
 *  "Synced ✓" | "Needs attention ⚠"
 *
 * Positioned sticky at the top of the content area (not viewport-fixed).
 */
import { useState, useEffect } from "react";
import { useOfflineStatus } from "@client/hooks/use-offline-status";
import { db } from "@client/db/dexie";
import { processQueue } from "@client/db/sync-queue";

interface OfflineBannerProps {
  businessId?: string;
}

interface QueueCounts {
  pending: number;
  submitting: number;
  conflict: number;
  failed: number;
}

function useSyncQueueCounts(businessId?: string): QueueCounts {
  const [counts, setCounts] = useState<QueueCounts>({
    pending: 0,
    submitting: 0,
    conflict: 0,
    failed: 0,
  });

  useEffect(() => {
    if (!businessId) return;

    let cancelled = false;

    async function refresh() {
      if (!businessId) return;
      try {
        const all = await db.syncQueue
          .where("[businessId+status]")
          .anyOf([
            [businessId, "pending"],
            [businessId, "submitting"],
            [businessId, "conflict"],
            [businessId, "failed"],
          ])
          .toArray();

        if (cancelled) return;
        setCounts({
          pending: all.filter((i) => i.status === "pending").length,
          submitting: all.filter((i) => i.status === "submitting").length,
          conflict: all.filter((i) => i.status === "conflict" || i.status === "failed").length,
          failed: all.filter((i) => i.status === "failed").length,
        });
      } catch {
        // Ignore Dexie errors during SSR hydration.
      }
    }

    void refresh();
    const interval = setInterval(() => void refresh(), 3_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [businessId]);

  return counts;
}

export function OfflineBanner({ businessId }: OfflineBannerProps) {
  const { isOffline } = useOfflineStatus();
  const counts = useSyncQueueCounts(businessId);
  const [syncing, setSyncing] = useState(false);

  const hasPending = counts.pending > 0;
  const hasSubmitting = counts.submitting > 0;
  const hasConflict = counts.conflict > 0;
  const totalActionable = counts.pending + counts.submitting + counts.conflict;

  // Derive a human-readable summary state.
  function getSyncLabel(): string {
    if (isOffline && totalActionable === 0) return "You are offline — changes saved locally";
    if (hasSubmitting) return "Synchronizing…";
    if (hasConflict) return `${counts.conflict} item${counts.conflict !== 1 ? "s" : ""} need attention ⚠`;
    if (hasPending) return `${counts.pending} item${counts.pending !== 1 ? "s" : ""} waiting to sync`;
    return "";
  }

  async function handleSyncNow() {
    if (!businessId) return;
    setSyncing(true);
    try {
      await processQueue(businessId);
    } finally {
      setSyncing(false);
    }
  }

  const label = getSyncLabel();

  // Don't render anything when online with nothing to show.
  if (!isOffline && totalActionable === 0) return null;

  // Choose banner color.
  let bannerClass: string;
  if (isOffline && totalActionable === 0) {
    bannerClass = "bg-gray-600 text-white";
  } else if (hasConflict) {
    bannerClass = "bg-danger-50 border-b border-danger-600/25 text-danger-700";
  } else if (hasSubmitting) {
    bannerClass = "bg-success-50 border-b border-success-600/25 text-success-700";
  } else {
    bannerClass = "bg-warning-50 border-b border-warning-600/25 text-warning-700";
  }

  return (
    <div
      className={`sticky top-0 z-20 px-4 py-2 text-sm flex items-center justify-between gap-3 ${bannerClass}`}
      role="status"
      aria-live="polite"
    >
      <span className="font-medium">{label}</span>

      <div className="flex items-center gap-2 shrink-0">
        {isOffline && (
          <span className="inline-flex items-center gap-1 text-xs font-medium">
            <span className="h-2 w-2 rounded-full bg-gray-400 inline-block" />
            Offline
          </span>
        )}

        {!isOffline && hasPending && businessId && (
          <button
            type="button"
            onClick={() => void handleSyncNow()}
            disabled={syncing || hasSubmitting}
            className="rounded px-2 py-0.5 text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {syncing ? "Syncing…" : "Sync now"}
          </button>
        )}
      </div>
    </div>
  );
}
