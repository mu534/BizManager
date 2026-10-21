"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

type RangeOption = "today" | "7days" | "month" | "custom";

interface RangeFilterProps {
  range: RangeOption;
  from?: string;
  to?: string;
  /** Extra search-param key/value pairs to preserve when changing range (e.g. sort). */
  keep?: Record<string, string>;
}

const OPTIONS: { value: RangeOption; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7days", label: "Last 7 days" },
  { value: "month", label: "This month" },
  { value: "custom", label: "Custom" },
];

export function RangeFilter({ range, from, to, keep }: RangeFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [customFrom, setCustomFrom] = useState(from ?? "");
  const [customTo, setCustomTo] = useState(to ?? "");

  const buildUrl = useCallback(
    (newRange: RangeOption, newFrom?: string, newTo?: string) => {
      const params = new URLSearchParams();
      // Carry over any extra params (e.g. sort) before overwriting range
      if (keep) {
        for (const [k, v] of Object.entries(keep)) {
          if (v !== undefined && v !== "") params.set(k, v);
        }
      }
      params.set("range", newRange);
      if (newRange === "custom" && newFrom && newTo) {
        params.set("from", newFrom);
        params.set("to", newTo);
      }
      return `${pathname}?${params.toString()}`;
    },
    [pathname, keep],
  );

  function handleRangeChange(value: RangeOption) {
    if (value !== "custom") {
      router.push(buildUrl(value));
    }
    // For custom we wait for the user to pick dates
  }

  function handleCustomApply() {
    if (customFrom && customTo) {
      router.push(buildUrl("custom", customFrom, customTo));
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Preset buttons */}
      <div
        role="group"
        aria-label="Date range"
        className="flex overflow-hidden rounded-lg border border-gray-200 bg-white"
      >
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            aria-pressed={range === opt.value}
            onClick={() => handleRangeChange(opt.value)}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              range === opt.value
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Custom date inputs — visible when custom is selected */}
      {range === "custom" && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            aria-label="From date"
            value={customFrom}
            max={customTo || undefined}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-400"
          />
          <span className="text-sm text-gray-400">–</span>
          <input
            type="date"
            aria-label="To date"
            value={customTo}
            min={customFrom || undefined}
            onChange={(e) => setCustomTo(e.target.value)}
            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-400"
          />
          <button
            type="button"
            disabled={!customFrom || !customTo}
            onClick={handleCustomApply}
            className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40 hover:bg-gray-700 transition-colors"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
