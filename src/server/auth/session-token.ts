/**
 * Signed session tokens — pure logic, no Next.js imports (unit-testable).
 *
 * Previous behaviour: the session cookie held the raw user UUID. A UUID is an
 * identifier, not a secret, so anyone who learned a user id could forge a
 * session. The cookie now carries an HMAC-SHA256 signed, expiring token.
 *
 * Format:  v1.<userId>.<expiresAtEpochSeconds>.<base64url(hmac)>
 * The HMAC covers "v1.<userId>.<expiresAt>". Comparison is constant-time.
 *
 * The signing key is SESSION_SECRET (>= 32 characters). Rotating it signs
 * every user out, which is the intended revocation lever.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const VERSION = "v1";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertSessionSecret(secret: string | undefined): string {
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set to a random string of at least 32 characters. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\"",
    );
  }
  return secret;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionToken(
  userId: string,
  secret: string,
  nowMs: number = Date.now(),
  ttlSeconds: number = SESSION_TTL_SECONDS,
): string {
  if (!UUID_RE.test(userId)) throw new Error("Invalid user id for session.");
  const expiresAt = Math.floor(nowMs / 1000) + ttlSeconds;
  const payload = `${VERSION}.${userId}.${expiresAt}`;
  return `${payload}.${sign(payload, secret)}`;
}

/** Returns the userId if the token is authentic and unexpired, otherwise null. */
export function verifySessionToken(
  token: string | undefined | null,
  secret: string,
  nowMs: number = Date.now(),
): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [version, userId, expiresRaw, signature] = parts;
  if (version !== VERSION || !userId || !expiresRaw || !signature) return null;
  if (!UUID_RE.test(userId) || !/^\d+$/.test(expiresRaw)) return null;

  const expected = Buffer.from(sign(`${version}.${userId}.${expiresRaw}`, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return null;
  }
  if (Number(expiresRaw) <= Math.floor(nowMs / 1000)) return null;
  return userId;
}
