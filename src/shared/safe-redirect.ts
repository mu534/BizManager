/**
 * Post-login redirect validation (open-redirect guard) — pure.
 *
 * Only same-site, in-app paths are accepted. Anything else — absolute URLs,
 * protocol-relative "//host", backslash tricks, or paths outside the app —
 * falls back to the default.
 */
const ALLOWED_PREFIXES = ["/app", "/admin", "/create-business"] as const;

export function safeNextPath(raw: string | null | undefined, fallback = "/app"): string {
  if (!raw) return fallback;
  if (raw.length > 512) return fallback;
  // Must be a single-slash absolute path; reject "//x", "/\x", control chars, encoded slashes.
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return fallback;
  }
  if (decoded.startsWith("//") || decoded.includes("\\") || /^\/[a-z][a-z0-9+.-]*:/i.test(decoded)) return fallback;

  const path = raw.split(/[?#]/, 1)[0] ?? "";
  const ok = ALLOWED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  return ok ? raw : fallback;
}
