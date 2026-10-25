"use client";

type RangeOption = "today" | "7days" | "month" | "custom";

const RANGES = [
  { key: "today", label: "Today" },
  { key: "7days", label: "7 days" },
  { key: "month", label: "This month" },
  { key: "custom", label: "Custom" },
] as const;

interface RangeFilterProps {
  range: RangeOption;
  from?: string;
  to?: string;
  /** Extra search-param key/value pairs to preserve when changing range (e.g. sort). */
  keep?: Record<string, string>;
  /** Branch list for reports that support branch filtering. Only shown when > 1 branch. */
  branches?: { id: string; name: string; closed: boolean }[];
  /** Currently selected branch id. */
  branchId?: string;
}

export function RangeFilter({ range, from, to, keep, branches, branchId }: RangeFilterProps) {
  return (
    <form method="GET" className="flex flex-wrap items-center gap-2">
      {Object.entries(keep ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {RANGES.map((r) => (
        <button
          key={r.key}
          name="range"
          value={r.key}
          type="submit"
          aria-pressed={range === r.key}
          className={`rounded-control px-3 py-1.5 text-[13px] font-medium transition ${
            range === r.key
              ? "bg-ink-900 text-white"
              : "border border-line-strong bg-surface text-ink-700 hover:bg-ink-50"
          }`}
        >
          {r.label}
        </button>
      ))}
      {branches && branches.length > 1 && (
        <span className="flex items-center gap-1.5">
          <label className="sr-only" htmlFor="rf-branch">Branch</label>
          <select
            id="rf-branch"
            name="branch"
            defaultValue={branchId ?? ""}
            className="h-8 rounded-control border border-line-strong bg-surface px-2 text-[13px]"
          >
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}{b.closed ? " (closed)" : ""}
              </option>
            ))}
          </select>
          <button
            type="submit"
            name="range"
            value={range}
            className="h-8 rounded-control border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink-700 hover:bg-ink-50"
          >
            Show
          </button>
        </span>
      )}
      {range === "custom" && (
        <>
          <label className="sr-only" htmlFor="rf-from">From</label>
          <input
            id="rf-from"
            name="from"
            type="date"
            defaultValue={from}
            className="h-8 rounded-control border border-line-strong px-2 text-[13px]"
          />
          <label className="sr-only" htmlFor="rf-to">To</label>
          <input
            id="rf-to"
            name="to"
            type="date"
            defaultValue={to}
            className="h-8 rounded-control border border-line-strong px-2 text-[13px]"
          />
          <button
            type="submit"
            className="h-8 rounded-control bg-brand-600 px-3 text-[13px] font-medium text-white hover:bg-brand-700"
          >
            Apply
          </button>
        </>
      )}
    </form>
  );
}
