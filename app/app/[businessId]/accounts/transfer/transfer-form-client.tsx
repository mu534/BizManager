"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Money } from "@shared/money";

interface Account { id: string; name: string; balance: number; }
interface Props { businessId: string; currency: string; accounts: Account[]; }

type Action = "transfer" | "deposit" | "withdraw";

export function TransferFormClient({ businessId, currency, accounts }: Props) {
  const router = useRouter();
  const fmt = (n: number) => Money.format(n, currency);
  const [action, setAction] = useState<Action>("transfer");
  const [fromId, setFromId] = useState(accounts[0]?.id ?? "");
  const [toId, setToId] = useState(accounts[1]?.id ?? accounts[0]?.id ?? "");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!amount || parseFloat(amount) <= 0) { setError("Enter a valid amount."); return; }
    setError("");
    setSubmitting(true);
    const payload =
      action === "transfer"
        ? { action: "transfer", fromAccountId: fromId, toAccountId: toId, amount, notes }
        : action === "deposit"
        ? { action: "deposit", accountId, amount, notes }
        : { action: "withdraw", accountId, amount, notes };

    try {
      const res = await fetch(`/api/${businessId}/accounts/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json() as { error?: { message?: string } };
      if (!res.ok) { setError(data.error?.message ?? "Operation failed."); setSubmitting(false); return; }
      router.push(`/app/${businessId}/accounts`);
    } catch { setError("Network error."); setSubmitting(false); }
  }

  return (
    <div className="rounded-card border border-line bg-surface p-6 space-y-4">
      {error && <div className="rounded-control bg-danger-50 border border-danger-600/25 px-4 py-3 text-sm text-danger-700">{error}</div>}

      <div className="flex gap-2">
        {(["transfer", "deposit", "withdraw"] as Action[]).map((a) => (
          <button key={a} type="button" onClick={() => setAction(a)}
            className={`rounded-control px-3 py-1.5 text-sm font-medium capitalize ${action === a ? "bg-brand-600 text-white" : "border border-line-strong text-ink-700 hover:bg-ink-50"}`}>
            {a}
          </button>
        ))}
      </div>

      {action === "transfer" ? (
        <>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">From</label>
            <select value={fromId} onChange={(e) => setFromId(e.target.value)}
              className="block w-full rounded-control border border-line-strong px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-600">
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} — {fmt(a.balance)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">To</label>
            <select value={toId} onChange={(e) => setToId(e.target.value)}
              className="block w-full rounded-control border border-line-strong px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-600">
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} — {fmt(a.balance)}</option>)}
            </select>
          </div>
        </>
      ) : (
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">Account</label>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}
            className="block w-full rounded-control border border-line-strong px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-600">
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} — {fmt(a.balance)}</option>)}
          </select>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-ink-700 mb-1">Amount</label>
        <input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
          className="block w-full rounded-control border border-line-strong px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-600"
          placeholder="0.00" />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink-700 mb-1">Notes</label>
        <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
          className="block w-full rounded-control border border-line-strong px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-600"
          placeholder="Optional" />
      </div>
      <div className="flex gap-3 pt-2">
        <button onClick={handleSubmit} disabled={submitting}
          className="rounded-control bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
          {submitting ? "Processing…" : "Confirm"}
        </button>
        <a href={`/app/${businessId}/accounts`}
          className="rounded-control border border-line-strong px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50">
          Cancel
        </a>
      </div>
    </div>
  );
}
