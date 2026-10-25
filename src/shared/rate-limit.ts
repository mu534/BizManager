/**
 * Fixed-window rate limiter — pure (the caller supplies `now`).
 *
 * In-memory, so it is PER SERVER INSTANCE and best-effort: it blunts bursts and
 * accidental loops, but is not a substitute for an edge/WAF limit on a
 * multi-instance or serverless deployment (see DEPLOYMENT.md).
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Milliseconds until the window resets (0 when allowed with room to spare). */
  retryAfterMs: number;
}

export interface RateLimiter {
  check(key: string, now: number): RateLimitResult;
}

export function createRateLimiter(opts: { limit: number; windowMs: number; maxKeys?: number }): RateLimiter {
  const { limit, windowMs } = opts;
  const maxKeys = opts.maxKeys ?? 10_000;
  const hits = new Map<string, { count: number; resetAt: number }>();

  return {
    check(key, now) {
      // Bound memory: drop expired entries when the table grows large.
      if (hits.size >= maxKeys) {
        for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
        if (hits.size >= maxKeys) hits.clear();
      }
      const cur = hits.get(key);
      if (!cur || cur.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
      }
      if (cur.count >= limit) {
        return { allowed: false, remaining: 0, retryAfterMs: cur.resetAt - now };
      }
      cur.count += 1;
      return { allowed: true, remaining: limit - cur.count, retryAfterMs: 0 };
    },
  };
}

/** Best-effort client address from proxy headers; never trusted for authorization. */
export function clientKey(headers: { get(name: string): string | null }): string {
  const fwd = headers.get("x-forwarded-for");
  const first = fwd?.split(",")[0]?.trim();
  return first || headers.get("x-real-ip")?.trim() || "unknown";
}
