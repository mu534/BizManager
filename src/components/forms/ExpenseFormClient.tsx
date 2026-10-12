"use client";

/**
 * ExpenseFormClient — offline-capable expense recording form.
 *
 * Online path: POST /api/[businessId]/expenses (existing route).
 * Offline path: write to db.localExpenses + enqueue to syncQueue.
 *
 * Shows sync status inline. After success, provides "Record another" / 
 * "View expenses" navigation links.
 */
import { useState } from "react";
import { Money } from "@shared/money";
import { db, getClientId } from "@client/db/dexie";
import { enqueueOperation, processQueue } from "@client/db/sync-queue";
import { useOfflineStatus } from "@client/hooks/use-offline-status";

interface Category {
  id: string;
  name: string;
}

interface FinancialAccount {
  id: string;
  name: string;
}

interface ExpenseFormClientProps {
  businessId: string;
  branchId: string;
  categories: Category[];
  accounts: FinancialAccount[];
  currency: string;
}

type FormState = "idle" | "submitting" | "success" | "error";

interface SavedExpense {
  syncStatus: "online" | "offline";
  amount: number;
  categoryName: string;
}

export function ExpenseFormClient({
  businessId,
  branchId,
  categories,
  accounts,
  currency,
}: ExpenseFormClientProps) {
  const { isOffline } = useOfflineStatus();
  const today = new Date().toISOString().slice(0, 10);

  const [formState, setFormState] = useState<FormState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [savedExpense, setSavedExpense] = useState<SavedExpense | null>(null);

  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [expenseDate, setExpenseDate] = useState(today);

  function resetForm() {
    setCategoryId(categories[0]?.id ?? "");
    setAccountId(accounts[0]?.id ?? "");
    setAmount("");
    setDescription("");
    setExpenseDate(today);
    setFormState("idle");
    setSavedExpense(null);
    setErrorMessage("");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMessage("Amount must be a positive number.");
      return;
    }
    if (!categoryId) {
      setErrorMessage("Select a category.");
      return;
    }
    if (!accountId) {
      setErrorMessage("Select a payment account.");
      return;
    }

    setErrorMessage("");
    setFormState("submitting");

    const syncOperationId = crypto.randomUUID();
    const categoryName =
      categories.find((c) => c.id === categoryId)?.name ?? "";

    if (!isOffline) {
      // ── Online path — POST to the existing API route ──────────────────────
      try {
        const res = await fetch(`/api/${businessId}/expenses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            branchId,
            categoryId,
            accountId,
            amount,
            description: description || undefined,
            expenseDate,
            syncOperationId,
          }),
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: { message?: string };
          };
          throw new Error(body?.error?.message ?? "Failed to save expense.");
        }

        setSavedExpense({
          syncStatus: "online",
          amount: Money.fromMajorUnits(parsedAmount, currency),
          categoryName,
        });
        setFormState("success");
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to save expense.",
        );
        setFormState("error");
      }
    } else {
      // ── Offline path — write to IndexedDB + enqueue ────────────────────────
      try {
        const localId = crypto.randomUUID();
        const clientId = getClientId();
        const amountInt = Money.fromMajorUnits(parsedAmount, currency);
        const now = Date.now();

        await db.localExpenses.add({
          id: localId,
          businessId,
          branchId,
          categoryId,
          accountId,
          amount: amountInt,
          description: description || null,
          expenseDate,
          syncOperationId,
          syncStatus: "pending",
          serverExpenseId: null,
          createdAt: now,
        });

        await enqueueOperation({
          syncOperationId,
          clientId,
          businessId,
          entityType: "EXPENSE",
          entityId: localId,
          operationType: "CREATE",
          payload: {
            categoryId,
            accountId,
            amount,
            description: description || null,
            expenseDate,
            branchId,
          },
          schemaVersion: 1,
        });

        setSavedExpense({
          syncStatus: "offline",
          amount: amountInt,
          categoryName,
        });
        setFormState("success");

        // Try syncing in the background.
        void processQueue(businessId);
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to save expense offline.",
        );
        setFormState("error");
      }
    }
  }

  // ─── Success state ──────────────────────────────────────────────────────────

  if (formState === "success" && savedExpense) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">✓</span>
          <div>
            <p className="font-semibold text-gray-900">Expense recorded</p>
            <p className="text-sm text-gray-500">
              {savedExpense.categoryName} —{" "}
              {Money.format(savedExpense.amount, currency)}
            </p>
          </div>
        </div>

        {savedExpense.syncStatus === "offline" && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            Saved locally — will sync automatically when connected.
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={resetForm}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Record another
          </button>
          <a
            href={`/app/${businessId}/expenses`}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            View expenses
          </a>
        </div>
      </div>
    );
  }

  // ─── Form ───────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      {isOffline && (
        <p className="mb-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          You are offline — expense will be saved locally and synced when connected.
        </p>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {(formState === "error" || errorMessage) && (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <div>
          <label
            htmlFor="categoryId"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Category *
          </label>
          <select
            id="categoryId"
            name="categoryId"
            required
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Select category…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="amount"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Amount *
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            step="0.01"
            required
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="0.00"
          />
        </div>

        <div>
          <label
            htmlFor="accountId"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Payment account *
          </label>
          <select
            id="accountId"
            name="accountId"
            required
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="expenseDate"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Date *
          </label>
          <input
            id="expenseDate"
            name="expenseDate"
            type="date"
            required
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label
            htmlFor="description"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Description
          </label>
          <input
            id="description"
            name="description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={formState === "submitting"}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {formState === "submitting" ? "Saving…" : "Save expense"}
          </button>
          <a
            href={`/app/${businessId}/expenses`}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}
