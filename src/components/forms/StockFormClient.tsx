"use client";

/**
 * StockFormClient — offline-capable stock changes (opening stock, receipt,
 * adjustment, damage).
 *
 * The change is written to the durable queue FIRST, then delivered. That single
 * path works the same online and offline, and the stable syncOperationId makes
 * an accidental double-tap or retry harmless on the server.
 */
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { db, getClientId, type SyncInventoryPayload } from "@client/db/dexie";
import { enqueueOperation, processQueue, waitForOutcome } from "@client/db/sync-queue";
import { Button } from "@components/ui/button";
import { Field, Input, Select } from "@components/ui/field";
import { Alert } from "@components/ui/primitives";

export interface StockProduct {
  id: string;
  name: string;
  sku: string | null;
}

type Kind = SyncInventoryPayload["kind"];

const KINDS: { value: Kind; label: string; help: string }[] = [
  { value: "STOCK_RECEIPT", label: "Stock received (purchase)", help: "Goods you bought. Updates your average cost." },
  { value: "STOCK_ADJUSTMENT", label: "Adjustment (count correction)", help: "Add or remove units after a stock count." },
  { value: "STOCK_DAMAGE", label: "Damaged or lost", help: "Units that can no longer be sold." },
  { value: "OPENING_STOCK", label: "Opening stock", help: "Stock you already had when you started using BizManager." },
];

type Result =
  | { kind: "idle" }
  | { kind: "synced" }
  | { kind: "offline" }
  | { kind: "held" }
  | { kind: "attention"; message: string }
  | { kind: "error"; message: string };

const MONEY = /^\d+(\.\d{1,2})?$/;

export function StockFormClient({
  businessId,
  branchId,
  products,
  initialProductId,
}: {
  businessId: string;
  branchId: string;
  products: StockProduct[];
  initialProductId?: string;
}) {
  const [kind, setKind] = useState<Kind>("STOCK_RECEIPT");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>({ kind: "idle" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formKey, setFormKey] = useState(0);

  const needsCost = kind === "STOCK_RECEIPT" || kind === "OPENING_STOCK";
  const help = KINDS.find((k) => k.value === kind)?.help;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    const productId = String(form.get("productId") ?? "");
    const qty = Number(form.get("quantity"));
    const direction = String(form.get("direction") ?? "add");
    const unitCost = String(form.get("unitCost") ?? "").trim();
    const reason = String(form.get("reason") ?? "").trim();
    const notes = String(form.get("notes") ?? "").trim();

    const errs: Record<string, string> = {};
    const product = products.find((p) => p.id === productId);
    if (!product) errs.productId = "Choose a product.";
    if (!Number.isInteger(qty) || qty <= 0) errs.quantity = "Enter a whole number greater than zero.";
    if (needsCost && !MONEY.test(unitCost)) errs.unitCost = "Enter the cost per unit, for example 120 or 120.50.";
    if (kind === "STOCK_ADJUSTMENT" && !reason) errs.reason = "Give a short reason for the adjustment.";
    setErrors(errs);
    if (Object.keys(errs).length > 0 || !product) return;

    let payload: SyncInventoryPayload;
    let delta: number;
    let summary: string;
    const base = { productId, branchId, ...(notes ? { notes } : {}) };
    if (kind === "STOCK_RECEIPT" || kind === "OPENING_STOCK") {
      payload = { ...base, kind, quantity: qty, unitCost };
      delta = qty;
      summary = `${kind === "OPENING_STOCK" ? "Opening stock" : "Received"} ${qty} × ${product.name}`;
    } else if (kind === "STOCK_ADJUSTMENT") {
      const signed = direction === "remove" ? -qty : qty;
      payload = { ...base, kind, quantity: signed, reason };
      delta = signed;
      summary = `Adjusted ${product.name} by ${signed > 0 ? "+" : ""}${signed} (${reason})`;
    } else {
      payload = { ...base, kind, quantity: qty };
      delta = -qty;
      summary = `Damaged or lost: ${qty} × ${product.name}`;
    }

    setBusy(true);
    setResult({ kind: "idle" });
    try {
      const syncOperationId = crypto.randomUUID();
      await enqueueOperation({
        syncOperationId,
        clientId: getClientId(),
        businessId,
        entityType: "INVENTORY",
        entityId: syncOperationId,
        operationType: "CREATE",
        payload,
        schemaVersion: 1,
        summary,
      });

      // Optimistic: keep the offline POS replica in step until the server confirms.
      await db.localProducts
        .where("[businessId+id]")
        .equals([businessId, productId])
        .modify((p) => {
          p.stockQuantity = Math.max(0, p.stockQuantity + delta);
        });

      void processQueue(businessId);
      const item = await waitForOutcome(syncOperationId);

      if (item?.status === "synced") {
        setResult({ kind: "synced" });
        setFormKey((k) => k + 1);
      } else if (item?.status === "held") {
        setResult({ kind: "held" });
        setFormKey((k) => k + 1);
      } else if (item?.status === "conflict" || item?.status === "failed") {
        setResult({ kind: "attention", message: item.lastError ?? "The server could not apply this change." });
        setFormKey((k) => k + 1);
      } else {
        // Still pending: offline or slow. Safely queued either way.
        setResult({ kind: "offline" });
        setFormKey((k) => k + 1);
      }
    } catch {
      setResult({ kind: "error", message: "Could not save on this device. Free some storage and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form key={formKey} onSubmit={onSubmit} className="space-y-4" noValidate>
      {result.kind === "synced" && <Alert tone="success" title="Stock updated">The change was recorded.</Alert>}
      {result.kind === "offline" && (
        <Alert tone="info" title="Saved on this device">
          You appear to be offline or the connection is slow. The change is safe and will be sent automatically.{" "}
          <Link href={`/app/${businessId}/sync`} className="font-semibold underline">See what is waiting</Link>
        </Alert>
      )}
      {result.kind === "held" && (
        <Alert tone="warning" title="Paused — subscription not active">
          Saved safely. It will be applied automatically after you renew.{" "}
          <Link href={`/app/${businessId}/settings/subscription`} className="font-semibold underline">Renew</Link>
        </Alert>
      )}
      {result.kind === "attention" && (
        <Alert tone="danger" title="The server could not apply this change">
          {result.message} It is kept on this device.{" "}
          <Link href={`/app/${businessId}/sync`} className="font-semibold underline">Review and fix</Link>
        </Alert>
      )}
      {result.kind === "error" && <Alert tone="danger">{result.message}</Alert>}

      <Field label="Product" htmlFor="productId" required error={errors.productId}>
        <Select id="productId" name="productId" defaultValue={initialProductId ?? ""} aria-invalid={!!errors.productId || undefined}>
          <option value="">Select product…</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.sku ? ` (${p.sku})` : ""}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="What happened?" htmlFor="kind" required hint={help}>
        <Select id="kind" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>{k.label}</option>
          ))}
        </Select>
      </Field>

      {kind === "STOCK_ADJUSTMENT" && (
        <Field label="Direction" htmlFor="direction">
          <Select id="direction" name="direction" defaultValue="add">
            <option value="add">Add units</option>
            <option value="remove">Remove units</option>
          </Select>
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Quantity" htmlFor="quantity" required error={errors.quantity}>
          <Input id="quantity" name="quantity" type="number" inputMode="numeric" min={1} step={1} invalid={!!errors.quantity} />
        </Field>
        {needsCost && (
          <Field label="Cost per unit (ETB)" htmlFor="unitCost" required error={errors.unitCost}>
            <Input id="unitCost" name="unitCost" inputMode="decimal" placeholder="120.00" invalid={!!errors.unitCost} />
          </Field>
        )}
      </div>

      {kind === "STOCK_ADJUSTMENT" && (
        <Field label="Reason" htmlFor="reason" required error={errors.reason}>
          <Input id="reason" name="reason" maxLength={200} placeholder="e.g. Stock count correction" invalid={!!errors.reason} />
        </Field>
      )}

      <Field label="Notes" htmlFor="notes" hint="Optional">
        <Input id="notes" name="notes" maxLength={500} />
      </Field>

      <div className="flex gap-3 pt-1">
        <Button type="submit" loading={busy}>Record stock change</Button>
        <Link
          href={`/app/${businessId}/inventory`}
          className="inline-flex h-10 items-center rounded-control border border-line-strong px-4 text-sm font-medium text-ink-700 hover:bg-ink-50"
        >
          Back to inventory
        </Link>
      </div>
    </form>
  );
}
