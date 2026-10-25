/**
 * POST /api/auth/session
 *
 * Exchanges a Firebase ID token for a server-side session cookie.
 * This is called by the client immediately after a successful Firebase sign-in.
 *
 * Flow:
 *   1. Validate the request body (Zod).
 *   2. Verify the Firebase ID token (Firebase Admin).
 *   3. Upsert the application User in PostgreSQL.
 *   4. Set an httpOnly session cookie containing the internal userId.
 *   5. Return the user's business memberships count so the client can
 *      decide where to redirect (onboarding vs. app).
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyFirebaseToken } from "@server/auth/verify-token";
import { setSessionCookie } from "@server/auth/session";
import { upsertUserFromFirebase } from "@server/services/user.service";
import { getBusinessesForUser } from "@server/services/business.service";
import { createSessionSchema } from "@shared/validation/auth.schema";
import { isAppError } from "@shared/errors";
import { clientKey, createRateLimiter } from "@shared/rate-limit";

// Best-effort, per instance: limits bursts of sign-in exchanges from one address.
// Real credential attacks are stopped upstream — a valid Firebase ID token is required.
const limiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = limiter.check(clientKey(request.headers), performance.timeOrigin + performance.now());
  if (!gate.allowed) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many attempts. Please wait a moment and try again." } },
      { status: 429, headers: { "Retry-After": String(Math.ceil(gate.retryAfterMs / 1000)), "Cache-Control": "no-store" } },
    );
  }

  try {
    // 1. Parse and validate the request body.
    const body: unknown = await request.json().catch(() => ({}));
    const parsed = createSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid request body" } },
        { status: 422 },
      );
    }

    // 2. Verify the Firebase ID token.
    const decoded = await verifyFirebaseToken(parsed.data.idToken);

    // 3. Upsert the application User in PostgreSQL.
    const user = await upsertUserFromFirebase(decoded);

    // 4. Set the session cookie.
    await setSessionCookie(user.id);

    // 5. Check if the user already has businesses (to decide redirect target).
    const businesses = await getBusinessesForUser(user.id);

    return NextResponse.json({
      ok: true,
      hasBusinesses: businesses.length > 0,
    });
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json(err.toSafeJSON(), { status: err.statusCode });
    }
    // Do not leak internal error details.
    console.error("[POST /api/auth/session] Unexpected error:", err);
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: "An unexpected error occurred." } },
      { status: 500 },
    );
  }
}
