import type { NextConfig } from "next";

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
