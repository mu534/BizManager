/**
 * Turns a browser's Content-Security-Policy violation report into one short, safe
 * log line. Pure and unit-tested. Query strings and fragments are dropped (they can
 * hold personal data), and violations caused by browser extensions are ignored.
 */

export interface CspViolation {
  directive: string;
  blocked: string;
  page: string;
}

const EXTENSION = /^(chrome|moz|safari|edge)-extension:|^about:|^webkit-masked-url:/i;

function stripUrl(u: unknown): string {
  if (typeof u !== "string" || u === "") return "";
  try {
    const url = new URL(u);
    return `${url.origin}${url.pathname}`;
  } catch {
    return u.slice(0, 40); // keywords such as "inline" or "eval"
  }
}

function fromRecord(r: Record<string, unknown>): CspViolation | null {
  const rawBlocked = r["blocked-uri"] ?? r["blockedURL"] ?? r["blockedUri"];
  // Check the raw value: URL parsing turns extension URLs into "null/...".
  if (typeof rawBlocked === "string" && EXTENSION.test(rawBlocked)) return null;
  const blocked = stripUrl(rawBlocked);
  const directive = String(r["effective-directive"] ?? r["effectiveDirective"] ?? r["violated-directive"] ?? "unknown").slice(0, 60);
  const page = stripUrl(r["document-uri"] ?? r["documentURL"] ?? r["documentUri"]);
  return { directive, blocked: blocked || "(none)", page };
}

/** Accepts both report formats browsers send; returns only real, page-caused violations. */
export function summarizeCspReports(body: unknown): CspViolation[] {
  const items: unknown[] = Array.isArray(body) ? body : [body];
  const out: CspViolation[] = [];
  for (const item of items.slice(0, 20)) {
    if (typeof item !== "object" || item === null) continue;
    const rec = item as Record<string, unknown>;
    const inner = (rec["csp-report"] ?? rec["body"]) as unknown;
    const v = fromRecord(typeof inner === "object" && inner !== null ? (inner as Record<string, unknown>) : rec);
    if (v) out.push(v);
  }
  return out;
}