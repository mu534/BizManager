/**
 * POST /api/auth/sign-out
 *
 * Clears the server-side session cookie.
 * Called by the client alongside firebaseAuth.signOut().
 */
import { NextResponse } from "next/server";
import { clearSessionCookie } from "@server/auth/session";

export async function POST(): Promise<NextResponse> {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
