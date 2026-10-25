import { describe, it, expect } from "vitest";
import { createRateLimiter, clientKey } from "@shared/rate-limit";

describe("createRateLimiter", () => {
  it("allows up to the limit, then blocks with a retry time", () => {
    const rl = createRateLimiter({ limit: 3, windowMs: 60_000 });
    const t = 1_000_000;
    expect(rl.check("ip", t)).toEqual({ allowed: true, remaining: 2, retryAfterMs: 0 });
    expect(rl.check("ip", t + 1).remaining).toBe(1);
    expect(rl.check("ip", t + 2).remaining).toBe(0);
    const blocked = rl.check("ip", t + 10_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(60_000 - 10_000);
  });

  it("resets after the window", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1_000 });
    expect(rl.check("ip", 0).allowed).toBe(true);
    expect(rl.check("ip", 500).allowed).toBe(false);
    expect(rl.check("ip", 1_000).allowed).toBe(true);
  });

  it("keeps separate counters per key", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(rl.check("a", 0).allowed).toBe(true);
    expect(rl.check("b", 0).allowed).toBe(true);
    expect(rl.check("a", 1).allowed).toBe(false);
  });

  it("bounds memory when many keys arrive", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 5 });
    for (let i = 0; i < 50; i++) expect(rl.check(`k${i}`, i).allowed).toBe(true);
  });
});

describe("clientKey", () => {
  const h = (m: Record<string, string>) => ({ get: (n: string) => m[n] ?? null });
  it("uses the first forwarded address, then x-real-ip, then 'unknown'", () => {
    expect(clientKey(h({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(clientKey(h({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(clientKey(h({}))).toBe("unknown");
  });
});
