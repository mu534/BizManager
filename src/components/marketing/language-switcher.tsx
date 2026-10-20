"use client";

import Link from "next/link";
import { LOCALES, LOCALE_LABELS, homePathFor, type Locale } from "@shared/i18n/locales";
import { rememberLocale } from "@client/locale-cookie";

/**
 * Language switcher. Each option is a real link to the localized page (works
 * without JavaScript, is indexable and shareable). Clicking also remembers the
 * choice in a cookie so the sign-in / sign-up pages, which have no locale in
 * their URL, open in the same language.
 */
export function LanguageSwitcher({ current, label }: { current: Locale; label: string }) {
  return (
    <nav aria-label={label} className="inline-flex rounded-control border border-line-strong bg-surface p-0.5 text-[13px]">
      {LOCALES.map((l) => {
        const active = l === current;
        return (
          <Link
            key={l}
            href={homePathFor(l)}
            hrefLang={l}
            lang={l}
            prefetch={false}
            aria-current={active ? "true" : undefined}
            onClick={() => rememberLocale(l)}
            className={`rounded-[5px] px-2.5 py-1 font-medium transition focus-visible:outline-2 focus-visible:outline-brand-600 ${
              active ? "bg-brand-600 text-white" : "text-ink-700 hover:bg-ink-100"
            }`}
          >
            {LOCALE_LABELS[l].native}
          </Link>
        );
      })}
    </nav>
  );
}
