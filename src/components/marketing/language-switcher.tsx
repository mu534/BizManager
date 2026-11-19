"use client";

import Link from "next/link";
import { LOCALES, LOCALE_LABELS, homePathFor, type Locale } from "@shared/i18n/locales";
import { rememberLocale } from "@client/locale-cookie";


export function LanguageSwitcher({
  current,
  label,
  tone = "light",
}: {
  current: Locale;
  label: string;
  tone?: "light" | "dark";
}) {
  const dark = tone === "dark";
  return (
    <nav aria-label={label} className={`inline-flex rounded-full border p-0.5 text-[13px] ${
        dark ? "border-white/20 bg-white/10 backdrop-blur" : "border-line-strong bg-surface"
      }`}>
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
            className={`rounded-full px-2.5 py-1 font-medium transition focus-visible:outline-2 focus-visible:outline-brand-600 ${
              active
                ? dark
                  ? "bg-white text-brand-800"
                  : "bg-brand-600 text-white"
                : dark
                ? "text-brand-100 hover:bg-white/15"
                : "text-ink-700 hover:bg-ink-100"
            }`}
          >
            {LOCALE_LABELS[l].native}
          </Link>
        );
      })}
    </nav>
  );
}
