"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Money } from "@shared/money";
import { db, getClientId, type LocalSaleItem, type SyncStatus } from "@client/db/dexie";
import { enqueueOperation, processQueue, startSyncProcessor } from "@client/db/sync-queue";
import { useOfflineStatus } from "@client/hooks/use-offline-status";

interface Account {
  id: string;
  name: string;
  type: string;
  balance: number;
}

interface CartItem {
  productId: string;
  productName: string;
  productSku: string | null;
  unitPrice: number; // integer storage units
  defaultPrice: number;
  quantity: number;
  discountAmount: number;
}

interface SearchResult {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  sellingPrice: number;
  stockSnapshot: { quantity: number } | null;
}

interface POSClientProps {
  businessId: string;
  branchId: string;
  currency: string;
  accounts: Account[];
  canOverridePrice: boolean;
}

type POSState = "cart" | "success";

// ─── Sync status badge ────────────────────────────────────────────────────────

function SyncStatusBadge({ status }: { status: SyncStatus }) {
  const config: Record<SyncStatus, { label: string; cls: string }> = {
    pending: { label: "Saved locally", cls: "bg-gray-100 text-gray-700" },
    submitting: { label: "Synchronizing…", cls: "bg-blue-50 text-blue-700" },
    synced: { label: "Synced ✓", cls: "bg-green-50 text-green-700" },
    conflict: { label: "Needs attention ⚠", cls: "bg-red-50 text-red-700" },
    failed: { label: "Waiting to sync", cls: "bg-amber-50 text-amber-700" },
  };
  const { label, cls } = config[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function POSClient({ businessId, branchId, currency, accounts, canOverridePrice }: POSClientProps) {
  const { isOffline } = useOfflineStatus();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [saleDiscount, setSaleDiscount] = useState("0");
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? "");
  const [state, setState] = useState<POSState>("cart");
  const [lastSaleSyncStatus, setLastSaleSyncStatus] = useState<SyncStatus>("pending");
  const [lastSaleFinalTotal, setLastSaleFinalTotal] = useState(0);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fmt = (n: number) => Money.format(n, currency);

  // Start background sync processor on mount.
  useEffect(() => {
    const cleanup = startSyncProcessor(businessId);

    // Seed local products cache while online.
    void seedLocalProducts();

    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, branchId]);

  // Seed the local products cache for offline search.
  async function seedLocalProducts() {
    if (isOffline) return;
    try {
      const res = await fetch(
        `/api/${businessId}/products/search?q=&branchId=${branchId}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as { products: SearchResult[] };
      const now = Date.now();
      const localProds = (data.products ?? []).map((p) => ({
        id: p.id,
        businessId,
        branchId,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        sellingPrice: p.sellingPrice,
        unit: "pcs",
        stockQuantity: p.stockSnapshot?.quantity ?? 0,
        status: "ACTIVE",
        syncedAt: now,
      }));
      await db.localProducts.bulkPut(localProds);
    } catch {
      // Non-critical — offline search will use whatever is already cached.
    }
  }

  // Debounced product search — network first, fall back to local cache.
  const handleSearch = useCallback(
    (q: string) => {
      setSearchQuery(q);
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      if (q.trim().length < 1) {
        setSearchResults([]);
        return;
      }
      searchTimeout.current = setTimeout(async () => {
        setSearching(true);
        try {
          if (!isOffline) {
            const res = await fetch(
              `/api/${businessId}/products/search?q=${encodeURIComponent(q)}&branchId=${branchId}`,
            );
            const data = (await res.json()) as { products: SearchResult[] };
            setSearchResults(data.products ?? []);
          } else {
            // Fall back to local IndexedDB cache.
            const lower = q.toLowerCase();
            const all = await db.localProducts
              .where("businessId")
              .equals(businessId)
              .toArray();
            const filtered = all.filter(
              (p) =>
                p.name.toLowerCase().includes(lower) ||
                (p.sku ?? "").toLowerCase().includes(lower) ||
                (p.barcode ?? "").toLowerCase().includes(lower),
            );
            setSearchResults(
              filtered.map((p) => ({
                id: p.id,
                name: p.name,
                sku: p.sku,
                barcode: p.barcode,
                sellingPrice: p.sellingPrice,
                stockSnapshot: { quantity: p.stockQuantity },
              })),
            );
          }
        } catch {
          setSearchResults([]);
        }
        setSearching(false);
      }, 200);
    },
    [businessId, branchId, isOffline],
  );

  const addToCart = useCallback((product: SearchResult) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          productSku: product.sku,
          unitPrice: product.sellingPrice,
          defaultPrice: product.sellingPrice,
          quantity: 1,
          discountAmount: 0,
        },
      ];
    });
    setSearchQuery("");
    setSearchResults([]);
  }, []);

  const removeItem = (productId: string) =>
    setCart((p) => p.filter((i) => i.productId !== productId));

  const setQty = (productId: string, qty: number) => {
    if (qty < 1) {
      removeItem(productId);
      return;
    }
    setCart((p) =>
      p.map((i) => (i.productId === productId ? { ...i, quantity: qty } : i)),
    );
  };

  const setItemDiscount = (productId: string, discount: string) => {
    const d = Money.fromMajorUnits(parseFloat(discount) || 0, currency);
    setCart((p) =>
      p.map((i) =>
        i.productId === productId
          ? { ...i, discountAmount: Math.max(0, d) }
          : i,
      ),
    );
  };

  const setItemPrice = (productId: string, price: string) => {
    if (!canOverridePrice) return;
    const p = Money.fromMajorUnits(parseFloat(price) || 0, currency);
    setCart((prev) =>
      prev.map((i) =>
        i.productId === productId ? { ...i, unitPrice: Math.max(0, p) } : i,
      ),
    );
  };

  // Compute totals.
  const subtotal = cart.reduce(
    (s, i) =>
      s +
      Money.subtract(
        Money.multiply(i.unitPrice, i.quantity),
        i.discountAmount,
      ),
    0,
  );
  const saleLevelDiscount = Money.fromMajorUnits(
    parseFloat(saleDiscount) || 0,
    currency,
  );
  const finalTotal = Math.max(0, Money.subtract(subtotal, saleLevelDiscount));

  // Offline-first sale completion.
  async function handleCompleteSale() {
    if (cart.length === 0) {
      setError("Add at least one product.");
      return;
    }
    if (!selectedAccountId) {
      setError("Select a payment account.");
      return;
    }
    setError("");
    setSubmitting(true);

    try {
      const syncOperationId = crypto.randomUUID();
      const localSaleId = crypto.randomUUID();
      const clientId = getClientId();
      const now = Date.now();

      // Convert cart items to LocalSaleItems (integer amounts).
      const localItems: LocalSaleItem[] = cart.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        productSku: i.productSku,
        unitPrice: i.unitPrice,
        quantity: i.quantity,
        discountAmount: i.discountAmount,
      }));

      // 1. Write to IndexedDB immediately — sale is "saved locally".
      await db.localSales.add({
        id: localSaleId,
        businessId,
        branchId,
        items: localItems,
        discountAmount: saleLevelDiscount,
        finalTotal,
        accountId: selectedAccountId,
        notes: null,
        receiptNumber: null,
        syncOperationId,
        syncStatus: "pending",
        serverSaleId: null,
        createdAt: now,
        updatedAt: now,
      });

      // 2. Enqueue the sync operation (preserving the original syncOperationId).
      await enqueueOperation({
        syncOperationId,
        clientId,
        businessId,
        entityType: "SALE",
        entityId: localSaleId,
        operationType: "CREATE",
        payload: {
          items: localItems.map((i) => ({
            productId: i.productId,
            unitPrice: Money.toDecimalString(i.unitPrice, currency),
            quantity: i.quantity,
            discountAmount: Money.toDecimalString(i.discountAmount, currency),
          })),
          discountAmount: Money.toDecimalString(saleLevelDiscount, currency),
          accountId: selectedAccountId,
          notes: null,
          branchId,
        },
        schemaVersion: 1,
      });

      // Show success immediately — the sale is durably saved locally.
      setLastSaleSyncStatus("pending");
      setLastSaleFinalTotal(finalTotal);
      setCart([]);
      setSaleDiscount("0");
      setState("success");

      // 3. If online, trigger sync immediately.
      if (!isOffline) {
        void processQueue(businessId).then(async () => {
          // Update displayed sync status.
          const updated = await db.localSales.get(localSaleId);
          if (updated) setLastSaleSyncStatus(updated.syncStatus);
        });
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save sale. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Success screen ─────────────────────────────────────────────────────────

  if (state === "success") {
    return (
      <div className="max-w-md mx-auto text-center space-y-4 py-12 px-4">
        <div className="text-4xl">✓</div>
        <h2 className="text-xl font-semibold text-gray-900">Sale recorded</h2>
        <p className="text-2xl font-bold text-gray-900">{fmt(lastSaleFinalTotal)}</p>
        <div className="flex justify-center">
          <SyncStatusBadge status={lastSaleSyncStatus} />
        </div>
        {lastSaleSyncStatus === "pending" && (
          <p className="text-xs text-gray-500">
            Saved locally — will sync when connected.
          </p>
        )}
        {lastSaleSyncStatus === "conflict" && (
          <p className="text-xs text-red-600">
            This sale could not be synced (e.g. insufficient stock on server).
            It is preserved locally and needs your attention.
          </p>
        )}
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => {
              setState("cart");
              setLastSaleSyncStatus("pending");
            }}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            New sale
          </button>
          <a
            href={`/app/${businessId}/sell/history`}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            View sales
          </a>
        </div>
      </div>
    );
  }

  // ─── Cart screen ────────────────────────────────────────────────────────────

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 pb-24 lg:pb-0">
      {/* Left / top: search */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Search product</h2>
        {isOffline && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            Offline — searching local cache
          </p>
        )}
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Name, SKU, or barcode…"
          className="block w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          autoFocus
        />
        {searching && <p className="text-xs text-gray-400">Searching…</p>}
        {searchResults.length > 0 && (
          <ul className="rounded-md border border-gray-200 bg-white divide-y divide-gray-100 shadow-sm max-h-72 overflow-y-auto">
            {searchResults.map((p) => {
              const stock = p.stockSnapshot?.quantity ?? 0;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => addToCart(p)}
                    disabled={stock === 0}
                    className="w-full text-left px-4 py-2.5 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-gray-900">
                          {p.name}
                        </span>
                        {p.sku && (
                          <span className="ml-2 text-xs text-gray-400">
                            {p.sku}
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-semibold text-gray-900">
                          {fmt(p.sellingPrice)}
                        </span>
                        <span
                          className={`ml-2 text-xs ${stock === 0 ? "text-red-500" : stock <= 5 ? "text-amber-500" : "text-gray-400"}`}
                        >
                          {stock === 0 ? "Out" : `${stock} left`}
                        </span>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {searchQuery && searchResults.length === 0 && !searching && (
          <p className="text-sm text-gray-400">
            No products found for &ldquo;{searchQuery}&rdquo;.
          </p>
        )}
      </div>

      {/* Right / bottom: cart */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">
          Cart {cart.length > 0 && `(${cart.length} items)`}
        </h2>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {cart.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-400">
            Add products by searching above
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
              {cart.map((item) => (
                <div key={item.productId} className="px-3 py-2.5 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {item.productName}
                    </span>
                    <button
                      onClick={() => removeItem(item.productId)}
                      className="text-xs text-gray-400 hover:text-red-500 shrink-0"
                      aria-label={`Remove ${item.productName}`}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setQty(item.productId, item.quantity - 1)}
                        className="w-7 h-7 rounded border border-gray-300 text-sm font-bold hover:bg-gray-100"
                        aria-label="Decrease quantity"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) =>
                          setQty(item.productId, parseInt(e.target.value) || 1)
                        }
                        className="w-12 text-center rounded border border-gray-300 px-1 py-0.5 text-sm"
                        aria-label="Quantity"
                      />
                      <button
                        onClick={() => setQty(item.productId, item.quantity + 1)}
                        className="w-7 h-7 rounded border border-gray-300 text-sm font-bold hover:bg-gray-100"
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>
                    {canOverridePrice ? (
                      <input
                        type="number"
                        step="0.01"
                        defaultValue={Money.toDecimalString(item.unitPrice, currency)}
                        onBlur={(e) => setItemPrice(item.productId, e.target.value)}
                        className="w-24 rounded border border-gray-300 px-2 py-0.5 text-sm text-right"
                        title="Override price"
                        aria-label="Unit price"
                      />
                    ) : (
                      <span className="text-sm text-gray-600">
                        {fmt(item.unitPrice)}
                      </span>
                    )}
                    <span className="ml-auto text-sm font-semibold">
                      {fmt(
                        Money.subtract(
                          Money.multiply(item.unitPrice, item.quantity),
                          item.discountAmount,
                        ),
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>{fmt(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-gray-600">
                <label htmlFor="saleDiscount">Sale discount</label>
                <input
                  id="saleDiscount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={saleDiscount}
                  onChange={(e) => setSaleDiscount(e.target.value)}
                  onBlur={(e) => setItemDiscount("__sale__", e.target.value)}
                  className="w-24 rounded border border-gray-300 px-2 py-0.5 text-right text-sm"
                />
              </div>
              <div className="flex justify-between font-semibold text-base border-t border-gray-200 pt-2">
                <span>Total</span>
                <span>{fmt(finalTotal)}</span>
              </div>
            </div>

            {/* Payment account */}
            <div>
              <label
                htmlFor="paymentAccount"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Payment account
              </label>
              <select
                id="paymentAccount"
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} — {fmt(a.balance)}
                  </option>
                ))}
              </select>
            </div>

            {/* Complete sale — fixed bottom on mobile */}
            <div className="fixed bottom-0 left-0 right-0 p-3 bg-white border-t border-gray-200 lg:relative lg:bottom-auto lg:left-auto lg:right-auto lg:p-0 lg:bg-transparent lg:border-0 z-10">
              <button
                type="button"
                onClick={() => void handleCompleteSale()}
                disabled={submitting}
                style={{ minHeight: "44px" }}
                className="w-full rounded-md bg-blue-600 px-4 py-3 text-base font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {submitting
                  ? "Saving…"
                  : `Complete sale — ${fmt(finalTotal)}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
