"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Money } from "@shared/money";

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
  unitCost: number;
  quantity: number;
  discountAmount: number;
}

interface SearchResult {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  sellingPrice: number;
  costPrice: number;
  stockSnapshot: { quantity: number } | null;
}

interface POSClientProps {
  businessId: string;
  branchId: string;
  currency: string;
  accounts: Account[];
  canOverridePrice: boolean;
}

type POSState = "cart" | "confirm" | "success";

export function POSClient({ businessId, branchId, currency, accounts, canOverridePrice }: POSClientProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [saleDiscount, setSaleDiscount] = useState("0");
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? "");
  const [state, setState] = useState<POSState>("cart");
  const [lastSale, setLastSale] = useState<{ receiptNumber: string | null; finalTotal: number } | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fmt = (n: number) => Money.format(n, currency);

  // Debounced product search.
  const handleSearch = useCallback(
    (q: string) => {
      setSearchQuery(q);
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      if (q.trim().length < 1) { setSearchResults([]); return; }
      searchTimeout.current = setTimeout(async () => {
        setSearching(true);
        try {
          const res = await fetch(`/api/${businessId}/products/search?q=${encodeURIComponent(q)}&branchId=${branchId}`);
          const data = await res.json() as { products: SearchResult[] };
          setSearchResults(data.products ?? []);
        } catch { setSearchResults([]); }
        setSearching(false);
      }, 200);
    },
    [businessId, branchId],
  );

  const addToCart = useCallback((product: SearchResult) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i
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
          unitCost: product.costPrice,
          quantity: 1,
          discountAmount: 0,
        },
      ];
    });
    setSearchQuery("");
    setSearchResults([]);
  }, []);

  const removeItem = (productId: string) => setCart((p) => p.filter((i) => i.productId !== productId));
  const setQty = (productId: string, qty: number) => {
    if (qty < 1) { removeItem(productId); return; }
    setCart((p) => p.map((i) => i.productId === productId ? { ...i, quantity: qty } : i));
  };
  const setItemDiscount = (productId: string, discount: string) => {
    const d = Money.fromMajorUnits(parseFloat(discount) || 0, currency);
    setCart((p) => p.map((i) => i.productId === productId ? { ...i, discountAmount: Math.max(0, d) } : i));
  };
  const setItemPrice = (productId: string, price: string) => {
    if (!canOverridePrice) return;
    const p = Money.fromMajorUnits(parseFloat(price) || 0, currency);
    setCart((prev) => prev.map((i) => i.productId === productId ? { ...i, unitPrice: Math.max(0, p) } : i));
  };

  // Compute totals.
  const subtotal = cart.reduce((s, i) => s + Money.subtract(Money.multiply(i.unitPrice, i.quantity), i.discountAmount), 0);
  const saleLevelDiscount = Money.fromMajorUnits(parseFloat(saleDiscount) || 0, currency);
  const finalTotal = Math.max(0, Money.subtract(subtotal, saleLevelDiscount));

  async function handleCompleteSale() {
    if (cart.length === 0) { setError("Add at least one product."); return; }
    if (!selectedAccountId) { setError("Select a payment account."); return; }
    setError("");
    setSubmitting(true);

    try {
      const payload = {
        branchId,
        items: cart.map((i) => ({
          productId: i.productId,
          unitPrice: Money.toDecimalString(i.unitPrice, currency),
          quantity: i.quantity,
          discountAmount: Money.toDecimalString(i.discountAmount, currency),
        })),
        discountAmount: Money.toDecimalString(saleLevelDiscount, currency),
        accountId: selectedAccountId,
      };

      const res = await fetch(`/api/${businessId}/sales`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json() as { sale?: { receiptNumber: string | null; finalTotal: number }; error?: { message?: string } };
      if (!res.ok) {
        setError(data.error?.message ?? "Sale failed. Please try again.");
        setSubmitting(false);
        return;
      }
      setLastSale({ receiptNumber: data.sale?.receiptNumber ?? null, finalTotal: data.sale?.finalTotal ?? finalTotal });
      setCart([]);
      setSaleDiscount("0");
      setState("success");
    } catch {
      setError("Network error. Please try again.");
    }
    setSubmitting(false);
  }

  if (state === "success" && lastSale) {
    return (
      <div className="max-w-md mx-auto text-center space-y-4 py-12">
        <div className="text-4xl">✓</div>
        <h2 className="text-xl font-semibold text-gray-900">Sale complete</h2>
        {lastSale.receiptNumber && (
          <p className="text-sm text-gray-500">Receipt: {lastSale.receiptNumber}</p>
        )}
        <p className="text-2xl font-bold text-gray-900">{fmt(lastSale.finalTotal)}</p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => { setState("cart"); setLastSale(null); }}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            New sale
          </button>
          <a href={`/app/${businessId}/sell/history`}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            View sales
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Left: search */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Search product</h2>
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
                        <span className="text-sm font-medium text-gray-900">{p.name}</span>
                        {p.sku && <span className="ml-2 text-xs text-gray-400">{p.sku}</span>}
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-semibold text-gray-900">{fmt(p.sellingPrice)}</span>
                        <span className={`ml-2 text-xs ${stock === 0 ? "text-red-500" : stock <= 5 ? "text-amber-500" : "text-gray-400"}`}>
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
          <p className="text-sm text-gray-400">No products found for "{searchQuery}".</p>
        )}
      </div>

      {/* Right: cart */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Cart {cart.length > 0 && `(${cart.length} items)`}</h2>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        {cart.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-400">
            Add products by searching on the left
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
              {cart.map((item) => (
                <div key={item.productId} className="px-3 py-2.5 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-gray-900 truncate">{item.productName}</span>
                    <button onClick={() => removeItem(item.productId)} className="text-xs text-gray-400 hover:text-red-500 shrink-0">✕</button>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setQty(item.productId, item.quantity - 1)}
                        className="w-6 h-6 rounded border border-gray-300 text-sm font-bold hover:bg-gray-100">−</button>
                      <input type="number" min="1" value={item.quantity}
                        onChange={(e) => setQty(item.productId, parseInt(e.target.value) || 1)}
                        className="w-12 text-center rounded border border-gray-300 px-1 py-0.5 text-sm" />
                      <button onClick={() => setQty(item.productId, item.quantity + 1)}
                        className="w-6 h-6 rounded border border-gray-300 text-sm font-bold hover:bg-gray-100">+</button>
                    </div>
                    {canOverridePrice ? (
                      <input
                        type="number" step="0.01"
                        defaultValue={Money.toDecimalString(item.unitPrice, currency)}
                        onBlur={(e) => setItemPrice(item.productId, e.target.value)}
                        className="w-24 rounded border border-gray-300 px-2 py-0.5 text-sm text-right"
                        title="Override price"
                      />
                    ) : (
                      <span className="text-sm text-gray-600">{fmt(item.unitPrice)}</span>
                    )}
                    <span className="ml-auto text-sm font-semibold">
                      {fmt(Money.subtract(Money.multiply(item.unitPrice, item.quantity), item.discountAmount))}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span><span>{fmt(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-gray-600">
                <span>Sale discount</span>
                <input type="number" step="0.01" min="0" value={saleDiscount}
                  onChange={(e) => setSaleDiscount(e.target.value)}
                  className="w-24 rounded border border-gray-300 px-2 py-0.5 text-right text-sm" />
              </div>
              <div className="flex justify-between font-semibold text-base border-t border-gray-200 pt-2">
                <span>Total</span><span>{fmt(finalTotal)}</span>
              </div>
            </div>

            {/* Payment account */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment account</label>
              <select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} — {fmt(a.balance)}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleCompleteSale}
              disabled={submitting}
              className="w-full rounded-md bg-blue-600 px-4 py-3 text-base font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {submitting ? "Processing…" : `Complete sale — ${fmt(finalTotal)}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
