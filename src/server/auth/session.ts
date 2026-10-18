/**
 * Server-side session management — SERVER ONLY.
 *
 * The session is a short-lived httpOnly cookie containing an HMAC-signed token.
 * Format: v1.<userId>.<expiresAtEpochSeconds>.<base64url(hmac)>
 *
 * The cookie stores a signed token (not the raw userId or Firebase token).
 * The proxy verifies the signature cheaply without a DB round-trip.
 * Full authorization (role, business membership) is enforced server-side
 * in layouts and route handlers via resolveContext().
 *
 * Cookie security:
 *   - httpOnly:  true  (JS cannot read it)
 *   - secure:    true in production (HTTPS only)
 *   - sameSite:  lax   (safe for most flows; strict breaks some OAuth redirects)
 *   - maxAge:    7 days
 *   - path:      /
 */
import "server-only";
import { cookies } from "next/headers";
import {
  createSessionToken,
  verifySessionToken,
  assertSessionSecret,
  SESSION_TTL_SECONDS,
} from "./session-token";

export const SESSION_COOKIE_NAME = "bm_session";

/**
 * Write the session cookie after successful sign-in.
 * Must be called from a Server Action or Route Handler (not a Server Component).
 */
export async function setSessionCookie(userId: string): Promise<void> {
  const secret = assertSessionSecret(process.env.SESSION_SECRET);
  const token = createSessionToken(userId, secret);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });
}

/**
 * Read and verify the session token from the request cookie.
 * Returns the userId if the token is valid and unexpired, null otherwise.
 * Never throws — callers decide what to do with a missing/invalid session.
 */
export async function getSessionUserId(): Promise<string | null> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) return null;
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return verifySessionToken(token, secret, performance.timeOrigin + performance.now());
}

/**
 * Clear the session cookie (sign-out).
 * Must be called from a Server Action or Route Handler.
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}
