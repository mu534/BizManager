import { describe, expect, it } from "vitest";
import { assertSessionSecret, createSessionToken, verifySessionToken } from "@server/auth/session-token";

const SECRET = "a".repeat(48);
const USER = "123e4567-e89b-42d3-a456-426614174000";
const NOW = Date.UTC(2026, 9, 15, 9, 0, 0);

describe("session tokens", () => {
  it("round-trips a valid token", () => {
    const t = createSessionToken(USER, SECRET, NOW);
    expect(verifySessionToken(t, SECRET, NOW + 1000)).toBe(USER);
  });

  it("regression: a raw user UUID (the old cookie format) is rejected", () => {
    expect(verifySessionToken(USER, SECRET, NOW)).toBeNull();
  });

  it("rejects tampering with the user id, expiry or signature", () => {
    const t = createSessionToken(USER, SECRET, NOW);
    const [v, , exp, sig] = t.split(".");
    const other = "223e4567-e89b-42d3-a456-426614174000";
    expect(verifySessionToken(`${v}.${other}.${exp}.${sig}`, SECRET, NOW)).toBeNull();
    expect(verifySessionToken(`${v}.${USER}.${Number(exp) + 99999}.${sig}`, SECRET, NOW)).toBeNull();
    expect(verifySessionToken(`${v}.${USER}.${exp}.${sig}x`, SECRET, NOW)).toBeNull();
  });

  it("rejects wrong secrets, expired tokens, junk and empty values", () => {
    const t = createSessionToken(USER, SECRET, NOW, 60);
    expect(verifySessionToken(t, "b".repeat(48), NOW)).toBeNull();
    expect(verifySessionToken(t, SECRET, NOW + 61_000)).toBeNull();
    for (const junk of ["", "a.b.c", "v1...", undefined, null, "v1.x.1.y"]) {
      expect(verifySessionToken(junk as string | null | undefined, SECRET, NOW)).toBeNull();
    }
  });

  it("refuses to run with a weak or missing secret", () => {
    expect(() => assertSessionSecret(undefined)).toThrow();
    expect(() => assertSessionSecret("short")).toThrow();
    expect(assertSessionSecret(SECRET)).toBe(SECRET);
  });

  it("only signs well-formed user ids", () => {
    expect(() => createSessionToken("not-a-uuid", SECRET, NOW)).toThrow();
  });
});
