import type { DailyPoint } from "@shared/profit";

/**
 * Daily net-sales bar chart rendered as server-side SVG (no chart library, no
 * client JS). Real data only; zero days render as empty slots. A visually
 * hidden table provides the same data to screen readers.
 */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

export function TrendChart({ points, format, compact }: { points: DailyPoint[]; format: (minor: number) => string; compact: (minor: number) => string }) {
  const W = 640, H = 220, L = 44, R = 8, T = 10, B = 26;
  const values = points.map((p) => p.net);
  const max = niceMax(Math.max(0, ...values));
  const min = Math.min(0, ...values);
  const lo = min < 0 ? -niceMax(-min) : 0;
  const y = (v: number) => T + (H - T - B) * (1 - (v - lo) / (max - lo));
  const slot = (W - L - R) / Math.max(1, points.length);
  const bar = Math.min(40, slot * 0.64);
  const ticks = [lo, lo + (max - lo) / 2, max].filter((t, i, a) => a.indexOf(t) === i);
  const labelEvery = Math.ceil(points.length / 8);
  const hasData = points.some((p) => p.sales !== 0 || p.refunds !== 0);

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily net sales" className="h-auto w-full">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeDasharray={t === 0 ? undefined : "3 4"} />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="10.5" fill="var(--color-ink-500)">{compact(t)}</text>
          </g>
        ))}
        {points.map((p, i) => {
          const cx = L + slot * i + slot / 2;
          const top = y(Math.max(p.net, 0));
          const h = Math.abs(y(p.net) - y(0));
          return (
            <g key={p.date}>
              <title>{`${p.date}: ${format(p.net)} net · ${p.count} sale${p.count === 1 ? "" : "s"}`}</title>
              {p.net !== 0 && (
                <rect x={cx - bar / 2} y={p.net >= 0 ? top : y(0)} width={bar} height={Math.max(2, h)} rx="3"
                  fill={p.net >= 0 ? "var(--color-brand-600)" : "var(--color-danger-600)"} />
              )}
              {i % labelEvery === 0 && (
                <text x={cx} y={H - 8} textAnchor="middle" fontSize="10.5" fill="var(--color-ink-500)">
                  {new Date(`${p.date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {!hasData && <figcaption className="-mt-2 pb-2 text-center text-xs text-ink-500">No sales recorded in this period yet.</figcaption>}
      <table className="sr-only">
        <caption>Daily net sales</caption>
        <thead><tr><th>Date</th><th>Net sales</th><th>Sales</th></tr></thead>
        <tbody>{points.map((p) => <tr key={p.date}><td>{p.date}</td><td>{format(p.net)}</td><td>{p.count}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}
