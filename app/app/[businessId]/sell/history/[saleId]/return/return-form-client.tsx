"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Money } from "@shared/money";

interface ReturnableItem {
  id: string;
  productName: string;
  productSku: string | null;
  originalQty: number;
  alreadyReturned: number;
  maxReturnable: number;
  unitPrice: number;
  lineTotal: number;
}

interface Account { id: string; name: string; }

interface Props {
  businessId: string;
  saleId: string;
  branchId: string;
  currency: string;
  accounts: Account[];
  returnableItems: ReturnableItem[];
}

export function ReturnFormClient({ businessId, saleId, branchId, currency, accounts, returnableItems }: Props) {
  const router = useRouter();
  const fmt = (n: number) => Money.format(n, currency);

  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(returnableItems.map((i) => [i.id, 0]))
  );
  const [dispositions, setDispositions] = useState<Record<string, "RESTOCK" | "DAMAGED">>(
    Object.fromEntries(returnableItems.map((i) => [i.id, "RESTOCK"]))
  );
  const [reason, setReason] = useState("");
  const [refundAccountId, setRefundAccountId] = useState(accounts[0]?.id ?? "");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedItems = returnableItems.filter((i) => (quantities[i.id] ?? 0) > 0);
  const totalRefund = selectedItems.reduce((sum, item) => {
    const qty = quantities[item.id] ?? 0;
    const refundPerUnit = Math.round(item.lineTotal / item.originalQty);
    return sum + Money.multiply(refundPerUnit, qty);
  }, 0);

  async function handleSubmit() {
    if (selectedItems.length === 0) { setError("Select at least one item to return."); return; }
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/${businessId}/sales/${saleId}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId,
          reason: reason || undefined,
          refundAccountId,
          items: selectedItems.map((i) => ({
            saleItemId: i.id,
            quantity: quantities[i.id],
            stockDisposition: dispositions[i.id],
          })),
        }),
      });
      const data = await res.json() as { error?: { message?: string } };
      if (!res.ok) { setError(data.error?.message ?? "Return failed."); setSubmitting(false); return; }
      router.push(`/app/${businessId}/sell/history/${saleId}`);
    } catch { setError("Network error. Please try again."); setSubmitting(false); }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Select items to return</h2>
        <div className="space-y-3">
          {returnableItems.map((item) => (
            <div key={item.id} className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{item.productName}</p>
                <p className="text-xs text-gray-400">
                  Originally sold: {item.originalQty} · Returnable: {item.maxReturnable} · {fmt(item.unitPrice)} each
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={0} max={item.maxReturnable}
                  value={quantities[item.id] ?? 0}
                  onChange={(e) => setQuantities((p) => ({ ...p, [item.id]: Math.min(item.maxReturnable, Math.max(0, parseInt(e.target.value) || 0)) }))}
                  className="w-16 rounded border border-gray-300 px-2 py-1 text-sm text-center"
                />
                <select
                  value={dispositions[item.id]}
                  onChange={(e) => setDispositions((p) => ({ ...p, [item.id]: e.target.value as "RESTOCK" | "DAMAGED" }))}
                  className="rounded border border-gray-300 px-2 py-1 text-xs"
                >
                  <option value="RESTOCK">Restock</option>
                  <option value="DAMAGED">Damaged</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Reason for return</label>
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Customer changed mind, defective item…"
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Refund from account</label>
          <select value={refundAccountId} onChange={(e) => setRefundAccountId(e.target.value)}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        {totalRefund > 0 && (
          <div className="flex justify-between text-sm font-semibold border-t border-gray-200 pt-3">
            <span>Total refund</span><span>{fmt(totalRefund)}</span>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button onClick={handleSubmit} disabled={submitting || selectedItems.length === 0}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
          {submitting ? "Processing…" : "Confirm return"}
        </button>
        <a href={`/app/${businessId}/sell/history/${saleId}`}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          Cancel
        </a>
      </div>
    </div>
  );
}
