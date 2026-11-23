"use client";

import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, LOCALE_LABELS, LOCALES, type Locale } from "@shared/i18n/locales";

interface LocaleSwitcherProps {
  current: Locale;
}

export function LocaleSwitcher({ current }: LocaleSwitcherProps) {
  const router = useRouter();

  function pick(locale: Locale) {
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  return (
    <details className="relative inline-block">
      <summary
        className="flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-ink-200 px-3 py-1.5 text-sm font-medium text-ink-700 transition hover:bg-ink-50 [&::-webkit-details-marker]:hidden"
        aria-label="Language"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 shrink-0" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M10 2a8 8 0 1 0 0 16A8 8 0 0 0 10 2Zm0 1.5a6.48 6.48 0 0 1 4.47 1.77C13.5 6.63 11.83 7.5 10 7.5S6.5 6.63 5.53 5.27A6.48 6.48 0 0 1 10 3.5ZM4.3 6.52C5.5 8.08 7.63 9 10 9s4.5-.92 5.7-2.48A6.5 6.5 0 0 1 16.5 10c0 1.17-.31 2.27-.86 3.21C14.5 11.9 12.37 11 10 11s-4.5.9-5.64 2.21A6.5 6.5 0 0 1 3.5 10c0-1.3.38-2.5 1.03-3.52l-.23.04Zm.98 7.9C6.4 13.08 8.1 12.5 10 12.5s3.6.58 4.72 1.92A6.47 6.47 0 0 1 10 16.5a6.47 6.47 0 0 1-4.72-2.08Z"
            clipRule="evenodd"
          />
        </svg>
        {LOCALE_LABELS[current].native}
        <svg aria-hidden="true" viewBox="0 0 20 20" className="size-3.5 shrink-0 opacity-70" fill="currentColor">
          <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
        </svg>
      </summary>
      <ul className="absolute right-0 top-full z-50 mt-1 min-w-[10rem] rounded-xl border border-line bg-surface p-1.5 shadow-pop">
        {LOCALES.map((locale) => (
          <li key={locale}>
            <button
              type="button"
              onClick={() => pick(locale)}
              aria-current={locale === current ? "true" : undefined}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                locale === current
                  ? "bg-brand-50 font-semibold text-brand-700"
                  : "text-ink-700 hover:bg-ink-50"
              }`}
            >
              {LOCALE_LABELS[locale].native}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
