const LANGUAGES = [
  { code: "en", label: "English", href: "/" },
  { code: "om", label: "Afaan Oromoo", href: "/om" },
  { code: "am", label: "አማርኛ", href: "/am" },
] as const;

type LangCode = (typeof LANGUAGES)[number]["code"];

interface LanguageSwitcherProps {
  current: LangCode;
  label: string;
  tone?: "dark" | "light";
  placement?: "top" | "bottom";
}

export function LanguageSwitcher({
  current,
  label,
  tone = "dark",
  placement = "bottom",
}: LanguageSwitcherProps) {
  const currentLang = LANGUAGES.find((l) => l.code === current)!;

  const dropdownPos = placement === "top" ? "bottom-full mb-1" : "top-full mt-1";

  const triggerClass =
    tone === "dark"
      ? "flex items-center gap-1.5 rounded-full border border-white/25 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/10"
      : "flex items-center gap-1.5 rounded-full border border-ink-200 px-3 py-1.5 text-sm font-medium text-ink-700 transition hover:bg-ink-50";

  return (
    <details className="relative inline-block">
      <summary
        className={`${triggerClass} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
        aria-label={label}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="size-4 shrink-0"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M10 2a8 8 0 1 0 0 16A8 8 0 0 0 10 2Zm0 1.5a6.48 6.48 0 0 1 4.47 1.77C13.5 6.63 11.83 7.5 10 7.5S6.5 6.63 5.53 5.27A6.48 6.48 0 0 1 10 3.5ZM4.3 6.52C5.5 8.08 7.63 9 10 9s4.5-.92 5.7-2.48A6.5 6.5 0 0 1 16.5 10c0 1.17-.31 2.27-.86 3.21C14.5 11.9 12.37 11 10 11s-4.5.9-5.64 2.21A6.5 6.5 0 0 1 3.5 10c0-1.3.38-2.5 1.03-3.52l-.23.04Zm.98 7.9C6.4 13.08 8.1 12.5 10 12.5s3.6.58 4.72 1.92A6.47 6.47 0 0 1 10 16.5a6.47 6.47 0 0 1-4.72-2.08Z"
            clipRule="evenodd"
          />
        </svg>
        {currentLang.label}
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="size-3.5 shrink-0 opacity-70"
          fill="currentColor"
        >
          <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
        </svg>
      </summary>
      <ul
        className={`absolute right-0 z-50 ${dropdownPos} min-w-[10rem] rounded-xl border border-white/15 bg-brand-900 p-1.5 shadow-pop`}
      >
        {LANGUAGES.map((lang) => (
          <li key={lang.code}>
            <a
              href={lang.href}
              hrefLang={lang.code}
              aria-current={lang.code === current ? "true" : undefined}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                lang.code === current
                  ? "bg-white/10 font-semibold text-white"
                  : "text-brand-100 hover:bg-white/10 hover:text-white"
              }`}
            >
              {lang.label}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
