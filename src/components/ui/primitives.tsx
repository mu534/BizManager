import type { HTMLAttributes, ReactNode, ThHTMLAttributes, TdHTMLAttributes } from "react";
import Link from "next/link";
import { cn } from "./cn";
import { IconAlert, IconCheck, IconChevronRight, IconInfo } from "./icons";

// ─── Card ────────────────────────────────────────────────
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-card border border-line bg-surface shadow-card", className)} {...rest} />;
}
export function CardHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink-900">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-ink-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

// ─── Badge ───────────────────────────────────────────────
export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";
const TONES: Record<Tone, string> = {
  neutral: "bg-ink-100 text-ink-700",
  success: "bg-success-50 text-success-700",
  warning: "bg-warning-50 text-warning-700",
  danger: "bg-danger-50 text-danger-700",
  info: "bg-info-50 text-info-700",
  brand: "bg-brand-50 text-brand-800",
};
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded px-2 py-0.5 text-xs font-medium", TONES[tone], className)}>
      {children}
    </span>
  );
}

// ─── Alert ───────────────────────────────────────────────
const ALERT: Record<Exclude<Tone, "neutral" | "brand">, string> = {
  success: "border-success-600/25 bg-success-50 text-success-700",
  warning: "border-warning-600/25 bg-warning-50 text-warning-700",
  danger: "border-danger-600/25 bg-danger-50 text-danger-700",
  info: "border-info-600/25 bg-info-50 text-info-700",
};
export function Alert({ tone = "info", title, children, action }: { tone?: keyof typeof ALERT; title?: string; children?: ReactNode; action?: ReactNode }) {
  const Icon = tone === "success" ? IconCheck : tone === "info" ? IconInfo : IconAlert;
  return (
    <div role={tone === "danger" || tone === "warning" ? "alert" : "status"} className={cn("flex gap-3 rounded-card border px-4 py-3 text-sm", ALERT[tone])}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

// ─── Empty state ─────────────────────────────────────────
export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-card bg-brand-50 text-brand-700">{icon}</div>}
      <h3 className="text-[15px] font-semibold text-ink-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-[bm-pulse_1.4s_ease-in-out_infinite] rounded bg-ink-100", className)} />;
}

// ─── Page header ─────────────────────────────────────────
export function PageHeader({
  title, description, actions, breadcrumbs,
}: { title: string; description?: string; actions?: ReactNode; breadcrumbs?: { label: string; href?: string }[] }) {
  return (
    <div className="mb-5 sm:mb-6">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1 text-[13px] text-ink-500">
          {breadcrumbs.map((b, i) => (
            <span key={`${b.label}-${i}`} className="inline-flex items-center gap-1">
              {i > 0 && <IconChevronRight size={12} />}
              {b.href ? <Link href={b.href} className="hover:text-ink-900 hover:underline">{b.label}</Link> : <span aria-current="page" className="text-ink-700">{b.label}</span>}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-ink-900 sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-ink-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

// ─── Stat ────────────────────────────────────────────────
export function Stat({ label, value, sub, tone = "neutral", emphasis }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "neutral" | "positive" | "negative"; emphasis?: boolean }) {
  return (
    <Card className={cn("p-4", emphasis && "border-brand-600/30 bg-brand-50/40")}>
      <p className="text-[13px] font-medium text-ink-500">{label}</p>
      <p className={cn("mt-1.5 text-[22px] font-semibold leading-tight tracking-tight tabular-nums sm:text-2xl", tone === "negative" ? "text-danger-700" : tone === "positive" ? "text-brand-700" : "text-ink-900")}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-ink-500">{sub}</p>}
    </Card>
  );
}

// ─── Table ───────────────────────────────────────────────
export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("overflow-x-auto", className)}>{children}</div>;
}
export function Table({ className, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full min-w-[560px] border-collapse text-sm", className)} {...rest} />;
}
export function Th({ className, align, ...rest }: ThHTMLAttributes<HTMLTableCellElement> & { align?: "right" }) {
  return <th scope="col" className={cn("whitespace-nowrap border-b border-line bg-ink-50 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-500 first:pl-5 last:pr-5", align === "right" && "text-right", className)} {...rest} />;
}
export function Td({ className, align, ...rest }: TdHTMLAttributes<HTMLTableCellElement> & { align?: "right" }) {
  return <td className={cn("border-b border-line px-4 py-3 align-middle text-ink-800 first:pl-5 last:pr-5", align === "right" && "text-right tabular-nums", className)} {...rest} />;
}

// ─── Pagination (link based; works in server components) ─
export function Pagination({ page, pageSize, total, hrefFor }: { page: number; pageSize: number; total: number; hrefFor: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const link = "inline-flex h-8 items-center rounded-control border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink-800 hover:bg-ink-50";
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-[13px] text-ink-600 sm:px-5">
      <span>{from}–{to} of {total}</span>
      <span className="flex gap-2">
        {page > 1 ? <Link className={link} href={hrefFor(page - 1)} rel="prev">Previous</Link> : <span className={cn(link, "pointer-events-none opacity-40")} aria-disabled="true">Previous</span>}
        {page < pages ? <Link className={link} href={hrefFor(page + 1)} rel="next">Next</Link> : <span className={cn(link, "pointer-events-none opacity-40")} aria-disabled="true">Next</span>}
      </span>
    </nav>
  );
}

// ─── Link tabs ───────────────────────────────────────────
export function LinkTabs({ items }: { items: { label: string; href: string; active: boolean }[] }) {
  return (
    <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {items.map((t) => (
        <Link key={t.href} href={t.href} role="tab" aria-selected={t.active} className={cn("-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium", t.active ? "border-brand-600 text-brand-700" : "border-transparent text-ink-500 hover:text-ink-900")}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}
