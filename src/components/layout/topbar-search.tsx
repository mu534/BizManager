"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { IconSearch } from "@components/ui/icons";

/**
 * Global search — functional scope: finds products by name, SKU or barcode
 * (the product list is the only searchable entity today, so the field says so).
 */
export function TopbarSearch({ base }: { base: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    const term = q.trim();
    router.push(term ? `${base}/products?q=${encodeURIComponent(term)}` : `${base}/products`);
  }

  return (
    <form onSubmit={submit} role="search" className="relative hidden w-64 md:block">
      <label htmlFor="global-search" className="sr-only">Search products</label>
      <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
      <input
        id="global-search" type="search" value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Search products…"
        className="h-9 w-full rounded-control border border-line bg-ink-50 pl-9 pr-3 text-sm placeholder:text-ink-400 focus:border-brand-600 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand-600/25"
      />
    </form>
  );
}
