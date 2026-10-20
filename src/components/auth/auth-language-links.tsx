"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LOCALES, LOCALE_LABELS, type Locale } from "@shared/i18n/locales";
import { rememberLocale } from "@client/locale-cookie";

/** Language links for the auth pages: same page, `?lang=` swapped, other params kept. */
export function AuthLanguageLinks({ current, label }: { current: Locale; label: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <nav aria-label={label} className="flex justify-center gap-3 text-sm">
      {LOCALES.map((l) => {
        const next = new URLSearchParams(params.toString());
        next.set("lang", l);
        const active = l === current;
        return (
          <Link
            key={l}
            href={`${pathname}?${next.toString()}`}
            lang={l}
            hrefLang={l}
            aria-current={active ? "true" : undefined}
            onClick={() => rememberLocale(l)}
            className={active ? "font-semibold text-brand-700" : "text-ink-500 hover:text-ink-800 hover:underline"}
          >
            {LOCALE_LABELS[l].native}
          </Link>
        );
      })}
    </nav>
  );
}
