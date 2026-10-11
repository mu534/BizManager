/**
 * Next.js 16 Proxy (formerly middleware).
 * File: proxy.ts (renamed from middleware.ts in Next.js 16).
 *
 * Provides coarse-grained route protection:
 *   - App routes (/app/*) require a session cookie.
 *   - Auth routes (/sign-in, /sign-up) redirect authenticated users to /app.
 *   - Onboarding routes (/create-business) require a session cookie.
 *
 * IMPORTANT: The proxy performs a lightweight cookie presence check only.
 * It does NOT verify the session value against the database — that would
 * be too expensive for every request. Full authorization (membership,
 * role, business access) is enforced inside each Server Action and
 * Route Handler via resolveContext().
 *
 * A user who clears their DB record but keeps their cookie will reach the
 * app shell, but every Server Action will fail with UNAUTHORIZED. This is
 * acceptable — defense in depth is provided at the service layer.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Inline the cookie name to avoid importing server-only modules in the proxy.
// Must stay in sync with SESSION_COOKIE_NAME in src/server/auth/session.ts.
const SESSION_COOKIE_NAME = "bm_session";

function hasSession(request: NextRequest): boolean {
  return !!request.cookies.get(SESSION_COOKIE_NAME)?.value;
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const authenticated = hasSession(request);

  // Protected app routes — redirect to sign-in if not authenticated.
  if (pathname.startsWith("/app") || pathname.startsWith("/create-business")) {
    if (!authenticated) {
      const signIn = new URL("/sign-in", request.url);
      // Preserve the intended destination for post-login redirect.
      signIn.searchParams.set("next", pathname);
      return NextResponse.redirect(signIn);
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
