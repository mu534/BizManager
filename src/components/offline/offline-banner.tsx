"use client";

/**
 * OfflineBanner — connectivity and sync-status indicator.
 *
 * Keeps three different situations visibly apart, because the shopkeeper must
 * respond to each differently:
 *   - OFFLINE            → nothing to do; saved on the device, syncs by itself.
 *   - PAUSED (held)      → a subscription restriction; renew, then it sends itself.
 *   - NEEDS ATTENTION    → the server could not apply an item; review and fix.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useOfflineStatus } from "@client/hooks/use-offline-status";
import { db } from "@client/db/dexie";
import { processQueue } from "@client/db/sync-queue";
import { summarizeQueue, type QueueSummary, type QueueStatus } from "@shared/sync-policy";

interface OfflineBannerProps {
  businessId?: string;
}

const EMPTY: QueueSummary = { pending: 0, submitting: 0, held: 0, needsAttention: 0 };

function useQueueSummary(businessId?: string): QueueSummary {
  const [summary, setSummary] = useState<QueueSummary>(EMPTY);

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;

    async function refresh() {
      if (!businessId) return;
      try {
        const rows = await db.syncQueue
          .where("[businessId+status]")
          .anyOf([
            [businessId, "pending"],
            [businessId, "submitting"],
            [businessId, "held"],
            [businessId, "conflict"],
            [businessId, "failed"],
          ])
          .toArray();
        if (!cancelled) setSummary(summarizeQueue(rows.map((r) => r.status as QueueStatus)));
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

  return summary;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function OfflineBanner({ businessId }: OfflineBannerProps) {
  const { isOffline } = useOfflineStatus();
  const q = useQueueSummary(businessId);
  const [syncing, setSyncing] = useState(false);

  const waiting = q.pending + q.submitting + q.held + q.needsAttention;
  if (!isOffline && waiting === 0) return null;

  let tone: string;
  let message: string;
  let review = false;

  if (q.needsAttention > 0) {
    tone = "bg-danger-50 border-danger-600/25 text-danger-700";
    message = `${plural(q.needsAttention, "item needs", "items need")} your attention. Nothing was lost — it is kept on this device.`;
    review = true;
  } else if (q.held > 0) {
    tone = "bg-warning-50 border-warning-600/25 text-warning-700";
    message = `${plural(q.held, "item is", "items are")} paused because your subscription is not active. ${q.held === 1 ? "It is" : "They are"} saved safely and will send automatically after you renew.`;
    review = true;
  } else if (q.submitting > 0) {
    tone = "bg-success-50 border-success-600/25 text-success-700";
    message = "Synchronizing…";
  } else if (isOffline) {
    tone = "bg-ink-700 border-transparent text-white";
    message =
      q.pending > 0
        ? `You are offline — ${plural(q.pending, "item is", "items are")} saved on this device and will sync when you are back online.`
        : "You are offline — new sales and expenses will be saved on this device.";
  } else {
    tone = "bg-warning-50 border-warning-600/25 text-warning-700";
    message = `${plural(q.pending, "item", "items")} waiting to sync.`;
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

  return (
    <div className={`sticky top-0 z-20 flex items-center justify-between gap-3 border-b px-4 py-2 text-sm ${tone}`} role="status" aria-live="polite">
      <span className="font-medium">{message}</span>
      <div className="flex shrink-0 items-center gap-2">
        {review && businessId && (
          <Link href={`/app/${businessId}/sync`} className="rounded px-2 py-0.5 text-xs font-semibold underline">
            Review
          </Link>
        )}
        {!isOffline && q.pending + q.held > 0 && businessId && (
          <button
            type="button"
            onClick={() => void handleSyncNow()}
            disabled={syncing || q.submitting > 0}
            className="rounded bg-ink-900 px-2 py-0.5 text-xs font-semibold text-white hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {syncing ? "Syncing…" : "Sync now"}
          </button>
        )}
      </div>
    </div>
  );
}
