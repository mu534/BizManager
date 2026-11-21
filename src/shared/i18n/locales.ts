/** Supported public-site languages: English, Afaan Oromo ("om") and Amharic ("am"). */
export const LOCALES = ["en", "om", "am"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export const LOCALE_LABELS: Record<Locale, { native: string; english: string }> = {
  en: { native: "English", english: "English" },
  om: { native: "Afaan Oromoo", english: "Afaan Oromo" },
  am: { native: "አማርኛ", english: "Amharic" },
};

/** Public-site path for a locale: English lives at "/", Afaan Oromo at "/om", Amharic at "/am". */
export function homePathFor(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? "/" : `/${locale}`;
}

/** Cookie remembering the visitor's choice for pages without a locale in the URL (auth). */
export const LOCALE_COOKIE = "bm_locale";