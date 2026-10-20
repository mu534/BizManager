import type { ReactNode } from "react";
import Link from "next/link";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-canvas px-4 py-12 sm:px-6">
      <div className="w-full max-w-md space-y-6">
        <Link href="/" className="flex items-center justify-center gap-2 text-xl font-semibold tracking-tight text-ink-900" aria-label="BizManager">
          <span aria-hidden="true" className="grid size-8 place-items-center rounded-control bg-brand-gradient text-sm font-bold text-white">B</span>
          BizManager
        </Link>
        {children}
      </div>
    </div>
  );
}
