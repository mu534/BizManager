/**
 * Server-side session management — SERVER ONLY.
 *
 * The session is a short-lived httpOnly cookie containing only the
 * application userId (not the Firebase token). The flow is:
 *
 *   Browser                     API /auth/session              PostgreSQL
 *     │                               │                              │
 *     │  POST { idToken }             │                              │
 *     │──────────────────────────────>│                              │
 *     │                               │ verifyFirebaseToken()        │
 *     │                               │ upsertUserFromFirebase()─────>│
 *     │                               │<─────────────────────────────│
 *     │                               │ set httpOnly cookie           │
 *     │<──────────────────────────────│                              │
 *     │                               │
 *
 * The cookie stores only the internal userId (UUID). The server looks
 * up role and business membership from PostgreSQL on each request.
 * The raw Firebase ID token is NEVER stored in a readable cookie.
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

export const SESSION_COOKIE_NAME = "bm_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

/**
 * Write the session cookie after successful sign-in.
 * Must be called from a Server Action or Route Handler (not a Server Component).
 */
export async function setSessionCookie(userId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, userId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
}

/**
 * Read the session userId from the request cookie.
 * Returns null if no session cookie is present.
 * Never throws — callers decide what to do with a missing session.
 */
export async function getSessionUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return value ?? null;
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
