import type { ReactNode } from "react";
import type { Dictionary } from "@shared/i18n";

/**
 * Illustrative app screens built with the real UI patterns. Figures are sample
 * values (clearly labelled on the page) and are internally consistent:
 *   sales 8,400 − cost 5,100 = gross 3,300;  3,300 − expenses 900 = 2,400;
 *   cash 5,200 + Telebirr 2,600 + bank 600 = 8,400.
 */
type Preview = Dictionary["preview"];

/** Window chrome shared by every preview panel. */
function Frame({
  title,
  badge,
  children,
  className = "",
}: {
  title: string;
  badge?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-hero border border-white/60 bg-surface shadow-[0_24px_60px_-20px_rgb(8_18_31/0.45)] ring-1 ring-ink-900/5 ${className}`}
    >
      <div className="flex items-center gap-3 border-b border-line bg-ink-50 px-4 py-2.5">
        <span aria-hidden="true" className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-ink-200" />
          <span className="size-2.5 rounded-full bg-ink-200" />
          <span className="size-2.5 rounded-full bg-brand-300" />
        </span>
        <span className="text-[13px] font-semibold text-ink-800">{title}</span>
        {badge && (
          <span className="ml-auto rounded-full bg-warning-50 px-2 py-0.5 text-[11px] font-medium text-warning-700">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function SellScreen({ t }: { t: Preview }) {
  const rows = [
    { name: t.item1, qty: 2, amount: "900.00" },
    { name: t.item2, qty: 1, amount: "800.00" },
  ];
  return (
    <Frame title={t.sell} badge={t.pending}>
      <div className="space-y-3 p-4">
        <div className="h-9 rounded-control border border-line-strong bg-surface px-3 text-sm leading-9 text-ink-400">
          <span aria-hidden="true">⌕ </span>Cotton…
        </div>
        <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{t.cart}</p>
        <ul className="divide-y divide-line text-sm">
          {rows.map((r) => (
            <li key={r.name} className="flex items-center justify-between py-2">
              <span className="text-ink-800">
                {r.name} <span className="text-ink-500">× {r.qty}</span>
              </span>
              <span className="tabular-nums text-ink-900">{r.amount}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-line pt-3 text-sm">
          <span className="font-medium text-ink-700">{t.total}</span>
          <span className="text-lg font-semibold tabular-nums text-ink-900">1,700.00 ETB</span>
        </div>
        <div className="flex items-center justify-between rounded-control bg-brand-50 px-3 py-2 text-sm">
          <span className="text-ink-600">{t.pay}</span>
          <span className="font-medium text-brand-800">{t.telebirr}</span>
        </div>
        <div className="flex h-10 items-center justify-center rounded-control bg-brand-gradient text-sm font-medium text-white shadow-card">
          {t.confirm}
        </div>
      </div>
    </Frame>
  );
}

function TodayScreen({ t }: { t: Preview }) {
  const summary = [
    { label: t.sales, value: "8,400.00", strong: false },
    { label: t.cogs, value: "5,100.00", strong: false },
    { label: t.gross, value: "3,300.00", strong: true },
    { label: t.expenses, value: "900.00", strong: false },
    { label: t.operating, value: "2,400.00", strong: true },
  ];
  const accounts = [
    { label: t.cash, value: "5,200.00" },
    { label: t.telebirr, value: "2,600.00" },
    { label: t.bank, value: "600.00" },
  ];
  return (
    <Frame title={t.today}>
      <dl className="divide-y divide-line text-sm">
        {summary.map((s) => (
          <div key={s.label} className="flex items-center justify-between px-4 py-2">
            <dt className={s.strong ? "font-medium text-ink-900" : "text-ink-600"}>{s.label}</dt>
            <dd className={`tabular-nums ${s.strong ? "font-bold text-brand-700" : "text-ink-800"}`}>
              {s.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="grid grid-cols-3 gap-px border-t border-line bg-line text-center text-xs">
        {accounts.map((a) => (
          <div key={a.label} className="bg-brand-50/60 px-2 py-2">
            <p className="text-ink-500">{a.label}</p>
            <p className="font-medium tabular-nums text-ink-900">{a.value}</p>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function StockScreen({ t }: { t: Preview }) {
  return (
    <Frame title={t.stock}>
      <ul className="divide-y divide-line text-sm">
        <li className="flex items-center justify-between px-4 py-2">
          <span className="text-ink-800">{t.item1}</span>
          <span className="tabular-nums text-ink-600">24 {t.inStock}</span>
        </li>
        <li className="flex items-center justify-between px-4 py-2">
          <span className="text-ink-800">{t.item3}</span>
          <span className="inline-flex items-center gap-2">
            <span className="rounded bg-danger-50 px-1.5 py-0.5 text-[11px] font-medium text-danger-700">
              {t.lowStock}
            </span>
            <span className="tabular-nums text-ink-600">3 {t.inStock}</span>
          </span>
        </li>
      </ul>
    </Frame>
  );
}

export function ProductPreview({ t, compact = false }: { t: Preview; compact?: boolean }) {
  return (
    <figure aria-label={t.title} className="w-full">
      {compact ? (
        /* Hero: Today screen with the Sell screen floating over it. */
        <div className="relative pb-24 sm:pb-0">
          <TodayScreen t={t} />
          <div className="absolute -bottom-2 right-0 w-[78%] sm:-bottom-12 sm:-right-6 sm:w-[64%]">
            <SellScreen t={t} />
          </div>
        </div>
      ) : (
        <div className="grid items-start gap-5 md:grid-cols-[1.1fr_0.9fr]">
          <SellScreen t={t} />
          <div className="space-y-5">
            <TodayScreen t={t} />
            <StockScreen t={t} />
          </div>
        </div>
      )}
      <figcaption className={`text-center text-xs ${compact ? "mt-6 text-brand-100/80 sm:mt-16" : "mt-5 text-ink-500"}`}>
        {t.sampleNote}
      </figcaption>
    </figure>
  );
}
