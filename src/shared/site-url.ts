/** Public origin of the site, without a trailing slash. Used for SEO files. */
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

/** Public, indexable pages. Signed-in and admin areas are deliberately absent. */
export const PUBLIC_PATHS = ["/", "/om", "/am", "/privacy", "/terms"] as const;

/** Areas search engines must not crawl. */
export const PRIVATE_PATHS = ["/app", "/admin", "/api", "/create-business", "/offline"] as const;