import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * Content-Security-Policy, sent in REPORT-ONLY mode first: the browser logs
 * anything it would block (DevTools console) but breaks nothing. Review the
 * console on staging, then rename the header to "Content-Security-Policy" to
 * enforce it. 'unsafe-inline' is needed by Next.js inline bootstrap scripts
 * until nonces are adopted.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://apis.google.com https://www.gstatic.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.googleusercontent.com",
  "font-src 'self' data:",
  // Sentry hosts: only used when error monitoring is configured.
  "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.firebaseapp.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io",
  "frame-src https://accounts.google.com https://*.firebaseapp.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // Browsers post violations here (logged by app/api/csp-report/route.ts).
  "report-uri /api/csp-report",
].join("; ");

/**
 * CSP_ENFORCE=true switches the policy from report-only to enforcing. It is read when
 * the app is built, so set it before `next build`. Leave it unset until the violation
 * logs ("[csp] ..." lines) have been clean on staging.
 */
const CSP_HEADER = process.env.CSP_ENFORCE === "true" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    agentFeedback: true,
  },
  // Security headers for all routes
  async headers() {
    return [
      // Default security headers — applied to every route.
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          // same-origin blocks cross-origin popups from reading window.closed.
          // Override this on auth pages below.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          // Hardware features the app never uses stay off, even if a script asks.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          // Production only: HSTS on http://localhost would pin the dev machine to https.
          ...(isProd
            ? [
                { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
                { key: CSP_HEADER, value: CSP },
              ]
            : []),
        ],
      },
      // Auth pages use Google sign-in popups — COOP must allow popup messaging.
      {
        source: "/(sign-in|sign-up)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        ],
      },
    ];
  },
};

export default nextConfig;