import { LOCALE_COOKIE, type Locale } from "@shared/i18n/locales";

/**
 * Remember the visitor's language for pages without a locale in the URL
 * (sign-in / sign-up). A UI preference only: not sensitive, one year, site-wide.
 */
export function rememberLocale(locale: Locale): void {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}
