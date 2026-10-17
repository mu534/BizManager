import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "./cn";
import { IconSearch } from "./icons";

const CONTROL =
  "block w-full rounded-control border border-line-strong bg-surface px-3 text-sm text-ink-900 " +
  "placeholder:text-ink-400 transition focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/25 " +
  "disabled:bg-ink-50 disabled:text-ink-500 aria-[invalid=true]:border-danger-600 aria-[invalid=true]:ring-danger-600/20";

/** Label + control + hint/error wiring. Pass the id used by the control. */
export function Field({
  label, htmlFor, hint, error, required, children, className,
}: { label: string; htmlFor: string; hint?: string; error?: string | null; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-ink-800">
        {label}
        {required && <span className="text-danger-600" aria-hidden="true"> *</span>}
      </label>
      {children}
      {hint && !error && <p id={`${htmlFor}-hint`} className="text-xs text-ink-500">{hint}</p>}
      {error && <p id={`${htmlFor}-error`} role="alert" className="text-xs font-medium text-danger-600">{error}</p>}
    </div>
  );
}

export function Input({ className, invalid, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input aria-invalid={invalid || undefined} className={cn(CONTROL, "h-10", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(CONTROL, "h-10 pr-8", className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL, "min-h-20 py-2", className)} {...rest} />;
}

export function SearchInput({ className, ref, ...rest }: InputHTMLAttributes<HTMLInputElement> & { ref?: React.Ref<HTMLInputElement> }) {
  return (
    <div className={cn("relative", className)}>
      <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
      <input ref={ref} type="search" className={cn(CONTROL, "h-10 pl-9")} {...rest} />
    </div>
  );
}
