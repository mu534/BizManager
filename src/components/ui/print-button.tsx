"use client";

/** Opens the browser print dialog. A client component, so server pages can use it. */
export function PrintButton({ className, label = "Print" }: { className?: string; label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={className}>
      {label}
    </button>
  );
}