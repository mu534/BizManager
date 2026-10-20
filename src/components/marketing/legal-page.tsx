import Link from "next/link";
import type { ReactNode } from "react";

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/" className="text-[15px] font-semibold text-ink-900">BizManager</Link>
          <Link href="/" className="text-sm text-ink-600 hover:underline">← Back to home</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-semibold tracking-tight text-ink-900">{title}</h1>
        <p className="mt-1 text-sm text-ink-500">Last updated: {updated}</p>
        <div role="note" className="mt-5 rounded-control border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800">
          This is a working draft that describes how BizManager currently behaves. It has not yet been reviewed by a
          lawyer and must be reviewed before the service is launched commercially. It is available in English only.
        </div>
        <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-ink-700 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink-900 [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1">
          {children}
        </div>
        <p className="mt-10 text-sm text-ink-500">
          Questions?{" "}
          {SUPPORT_EMAIL ? <a className="text-brand-700 underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> : "Contact details will be published here before launch."}
        </p>
      </main>
    </div>
  );
}
