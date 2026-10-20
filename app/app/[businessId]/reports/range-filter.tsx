const RANGES = [
  { key: "today", label: "Today" },
  { key: "7days", label: "7 days" },
  { key: "month", label: "This month" },
  { key: "custom", label: "Custom" },
] as const;

/** Date-range filter (plain GET form — works without JavaScript). Extra hidden params are preserved. */
export function RangeFilter({
  range,
  from,
  to,
  keep,
}: {
  range: string;
  from?: string;
  to?: string;
  keep?: Record<string, string>;
}) {
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
            range === r.key ? "bg-ink-900 text-white" : "border border-line-strong bg-surface text-ink-700 hover:bg-ink-50"
          }`}
        >
          {r.label}
        </button>
      ))}
      {range === "custom" && (
        <>
          <label className="sr-only" htmlFor="rf-from">From</label>
          <input id="rf-from" name="from" type="date" defaultValue={from} className="h-8 rounded-control border border-line-strong px-2 text-[13px]" />
          <label className="sr-only" htmlFor="rf-to">To</label>
          <input id="rf-to" name="to" type="date" defaultValue={to} className="h-8 rounded-control border border-line-strong px-2 text-[13px]" />
          <button type="submit" className="h-8 rounded-control bg-brand-600 px-3 text-[13px] font-medium text-white hover:bg-brand-700">Apply</button>
        </>
      )}
    </form>
  );
}
