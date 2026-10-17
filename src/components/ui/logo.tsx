import { cn } from "./cn";

/** Brand mark: a 2×2 grid of cells resolving into an upward step — grid + growth. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="bm-g" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#059669" />
          <stop offset="0.55" stopColor="#0b7f6d" />
          <stop offset="1" stopColor="#0e7490" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="7" fill="url(#bm-g)" />
      <rect x="7" y="17" width="7" height="8" rx="1.5" fill="#fff" fillOpacity="0.55" />
      <rect x="17" y="11" width="7" height="14" rx="1.5" fill="#fff" />
      <rect x="7" y="7" width="7" height="6" rx="1.5" fill="#fff" fillOpacity="0.9" />
    </svg>
  );
}

export function Logo({ className, inverse = false }: { className?: string; inverse?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className={cn("text-[17px] font-semibold tracking-tight", inverse ? "text-white" : "text-ink-900")}>
        BizManager
      </span>
    </span>
  );
}
