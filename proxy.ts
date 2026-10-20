
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken } from "@server/auth/session-token";

// Inline the cookie name to avoid importing server-only modules in the proxy.
// Must stay in sync with SESSION_COOKIE_NAME in src/server/auth/session.ts.
const SESSION_COOKIE_NAME = "bm_session";

/**
 * True only for an authentic, unexpired, HMAC-signed session token.
 * The proxy runs on the Node.js runtime, so node:crypto is available.
 * Fails closed: a missing/weak SESSION_SECRET means nobody is authenticated.
 */
function hasValidSession(request: NextRequest): boolean {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) return false;
  return verifySessionToken(
      request.cookies.get(SESSION_COOKIE_NAME)?.value,
      secret,
      performance.timeOrigin + performance.now(),
    ) !== null;
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const authenticated = hasValidSession(request);
  const hadCookie = request.cookies.has(SESSION_COOKIE_NAME);

  // Protected app routes — redirect to sign-in if not authenticated.
  if (
    pathname.startsWith("/app") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/create-business")
  ) {
    if (!authenticated) {
      const signIn = new URL("/sign-in", request.url);
      // Preserve the intended destination for post-login redirect.
      signIn.searchParams.set("next", pathname);
      const res = NextResponse.redirect(signIn);
      if (hadCookie) res.cookies.delete(SESSION_COOKIE_NAME); // drop forged/expired cookie
      return res;
    }
  }

  // Auth pages — redirect to app if already authenticated.
  if (pathname === "/sign-in" || pathname === "/sign-up") {
    if (authenticated) {
      return NextResponse.redirect(new URL("/app", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static  (static files)
     * - _next/image   (image optimization)
     * - favicon.ico, icons/, public assets
     * - API routes (they handle their own auth)
     */
    "/((?!_next/static|_next/image|favicon.ico|icons/|api/).*)",
  ],
};
