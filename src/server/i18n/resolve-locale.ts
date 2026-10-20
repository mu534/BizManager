import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "@shared/i18n/locales";

/**
 * Locale for pages that have no locale in their URL (sign-in / sign-up):
 * explicit ?lang= wins, then the visitor's remembered choice, then English.
 * Reads cookies, so callers must be dynamic pages.
 */
export async function resolveLocale(langParam?: string | string[]): Promise<Locale> {
  const explicit = Array.isArray(langParam) ? langParam[0] : langParam;
  if (isLocale(explicit)) return explicit;
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(saved) ? saved : DEFAULT_LOCALE;
}
