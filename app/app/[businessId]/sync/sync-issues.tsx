"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { db, type LocalExpense, type LocalSale, type SyncQueueItem } from "@client/db/dexie";
import { discardItem, processQueue, retryItem } from "@client/db/sync-queue";
import { needsAttention, type QueueStatus } from "@shared/sync-policy";
import { Money } from "@shared/money";
import { Badge, Card, CardHeader, EmptyState } from "@components/ui/primitives";
import { Button } from "@components/ui/button";
import { ConfirmDialog } from "@components/ui/dialog";
import { useToast } from "@components/ui/toast";

const STATUS_LABEL: Record<string, { label: string; tone: "warning" | "danger" | "neutral" | "success" }> = {
  pending: { label: "Waiting to sync", tone: "neutral" },
  submitting: { label: "Syncing…", tone: "success" },
  held: { label: "Paused — subscription", tone: "warning" },
  conflict: { label: "Needs your attention", tone: "danger" },
  failed: { label: "Couldn’t be delivered", tone: "danger" },
};

const KIND_LABEL: Record<string, string> = {
  SALE: "Sale",
  EXPENSE: "Expense",
  INVENTORY: "Stock change",
};

/** Plain-language cause and what to do next. */
function explain(item: SyncQueueItem, businessId: string): { text: string; action?: { href: string; label: string } } {
  switch (item.lastErrorCode) {
    case "NETWORK":
      return { text: "Waiting for a connection. This is saved on your device and sends by itself." };
    case "AUTH":
      return { text: "You were signed out. Sign in again and it will send." };
    case "SUBSCRIPTION_LIMIT":
      return {
        text: "Paused because your subscription is not active. It is saved safely and will send automatically after you renew.",
        action: { href: `/app/${businessId}/settings/subscription`, label: "Renew subscription" },
      };
    case "INSUFFICIENT_STOCK":
      return {
        text: "There is not enough stock on the server to apply this. Record the missing stock first, then press Retry.",
        action: { href: `/app/${businessId}/inventory/adjust`, label: "Adjust stock" },
      };
    case "FORBIDDEN":
      return { text: "Your permission to do this was removed. Ask the owner, or discard it if it should not be sent." };
    case "NOT_FOUND":
    case "TENANT_VIOLATION":
      return { text: "Something this refers to (a product, account or branch) no longer exists. Review it, then retry or discard." };
    default:
      return { text: item.lastError ?? "The server could not apply this yet." };
  }
}

export function SyncIssues({ businessId, currency }: { businessId: string; currency: string }) {
  const toast = useToast();
  const [items, setItems] = useState<SyncQueueItem[] | null>(null);
  const [sales, setSales] = useState<Record<string, LocalSale>>({});
  const [expenses, setExpenses] = useState<Record<string, LocalExpense>>({});
  const [confirming, setConfirming] = useState<SyncQueueItem | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const rows = await db.syncQueue
      .where("[businessId+status]")
      .anyOf(["pending", "submitting", "held", "conflict", "failed"].map((s) => [businessId, s]))
      .toArray();
    rows.sort((a, b) => a.createdAt - b.createdAt);
    const [s, e] = await Promise.all([
      db.localSales.bulkGet(rows.filter((r) => r.entityType === "SALE").map((r) => r.entityId)),
      db.localExpenses.bulkGet(rows.filter((r) => r.entityType === "EXPENSE").map((r) => r.entityId)),
    ]);
    setSales(Object.fromEntries(s.filter((x): x is LocalSale => !!x).map((x) => [x.id, x])));
    setExpenses(Object.fromEntries(e.filter((x): x is LocalExpense => !!x).map((x) => [x.id, x])));
    setItems(rows);
  }, [businessId]);

  useEffect(() => {
    const t0 = setTimeout(() => void load(), 0);
    const t = setInterval(() => void load(), 3000);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
    };
  }, [load]);

  const describe = (item: SyncQueueItem): string => {
    if (item.summary) return item.summary;
    if (item.entityType === "SALE") {
      const s = sales[item.entityId];
      return s ? `${s.items.length} item${s.items.length === 1 ? "" : "s"}, ${Money.format(s.finalTotal, currency)}` : "Sale";
    }
    if (item.entityType === "EXPENSE") {
      const x = expenses[item.entityId];
      return x ? `${Money.format(x.amount, currency)}${x.description ? ` — ${x.description}` : ""}` : "Expense";
    }
    return "Stock change";
  };

  async function run(fn: () => Promise<void>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.show(ok, "success");
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (items === null) return <p className="text-sm text-ink-500">Loading…</p>;

  const attention = items.filter((i) => needsAttention(i.status as QueueStatus)).length;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Sync status</h1>
          <p className="mt-1 text-sm text-ink-600">
            Everything you record without a connection is saved on this device first. Nothing here has been lost.
          </p>
        </div>
        <Button
          variant="secondary"
          loading={busy}
          onClick={() => void run(async () => processQueue(businessId), "Sync attempted.")}
        >
          Sync now
        </Button>
      </div>

      {items.length === 0 ? (
        <Card>
          <EmptyState title="Everything is synced" description="There is nothing waiting on this device." />
        </Card>
      ) : (
        <Card>
          <CardHeader title={`${items.length} item${items.length === 1 ? "" : "s"} on this device`} description={attention > 0 ? `${attention} need your attention.` : undefined} />
          <ul className="divide-y divide-line">
            {items.map((item) => {
              const st = STATUS_LABEL[item.status] ?? { label: item.status, tone: "neutral" as const };
              const why = explain(item, businessId);
              const canDiscard = item.status === "conflict" || item.status === "failed";
              return (
                <li key={item.id} className="space-y-2 px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink-900">{KIND_LABEL[item.entityType] ?? item.entityType}</span>
                    <Badge tone={st.tone}>{st.label}</Badge>
                    <span className="text-xs text-ink-500">{new Date(item.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-ink-700">{describe(item)}</p>
                  <p className="text-sm text-ink-600">{why.text}</p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {why.action && (
                      <Link href={why.action.href} className="text-sm font-medium text-brand-700 underline">
                        {why.action.label}
                      </Link>
                    )}
                    {item.status !== "submitting" && (
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run(async () => { await retryItem(item.id); await processQueue(businessId); }, "Retry sent.")}>
                        Retry
                      </Button>
                    )}
                    {canDiscard && (
                      <Button size="sm" variant="danger" disabled={busy} onClick={() => setConfirming(item)}>
                        Don’t send
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <ConfirmDialog
        open={confirming !== null}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          const target = confirming;
          setConfirming(null);
          if (target) void run(() => discardItem(target.id), "Marked as not sent.");
        }}
        title="Don’t send this item?"
        description={`${confirming ? describe(confirming) : ""} It will not be recorded on the server, so your sales, stock or expense totals will not include it. The details stay on this device. This cannot be undone from here.`}
        confirmLabel="Don’t send"
      />
    </div>
  );
}
