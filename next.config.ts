import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

/**
 * Security headers.
 *
 * Ported from the Vantage (aiac-platform) header block so the hub and the
 * tools it links to present a consistent posture, with two deliberate
 * differences:
 *
 *  - connect-src allows NO external host at all -- not an AI provider, not a
 *    database. Since Phase D the hub DOES call Claude, but only from server
 *    code (src/app/api/assistant/route.ts): the browser talks to this
 *    origin's own /api/assistant and never to api.anthropic.com, so the
 *    provider key never reaches a client and CSP needs no new host. Postgres
 *    is likewise only ever reached from server-side code (src/lib/db). If
 *    any external hostname ever needs to appear here, something has gone
 *    wrong.
 *  - frame-ancestors 'none' (plus X-Frame-Options), because nothing should
 *    embed the catalog either.
 *
 * script-src keeps 'unsafe-inline' because the App Router injects per-page
 * inline bootstrap scripts whose hashes vary, and a nonce-based policy would
 * force every route to render dynamically -- destroying the static, cookie-free
 * delivery that is the point of this page. Vantage makes the same trade-off.
 *
 * 'unsafe-eval' is granted ONLY to the dev server, where React needs it for
 * debugging. It is gated on the build PHASE rather than process.env.NODE_ENV
 * because the phase is what Next actually passes to this function, while
 * NODE_ENV is not guaranteed to be set at the moment the config module is
 * evaluated.
 *
 * Verified against the live response, not assumed: a production server returns
 * "script-src 'self' 'unsafe-inline'" with no eval. Worth re-checking the same
 * way after any change here, since a CSP that is too permissive fails silently
 * -- everything works, which is exactly the problem.
 */
function securityHeaders(isDev: boolean) {
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";

  return [
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    },
    {
      key: "Content-Security-Policy",
      value: [
        "default-src 'self'",
        scriptSrc,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "form-action 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "upgrade-insecure-requests",
      ].join("; "),
    },
  ];
}

export default function nextConfig(phase: string): NextConfig {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER;
  return {
    poweredByHeader: false,
    /**
     * Phase C moved every public page under a locale segment. The old
     * addresses keep working -- and keep their search-engine history -- by
     * redirecting to English. Temporary (307) rather than permanent so the
     * default locale can change later without browsers having cached it.
     */
    async redirects() {
      return [
        { source: "/", destination: "/en", permanent: false },
        { source: "/about", destination: "/en/about", permanent: false },
        { source: "/tools/:slug", destination: "/en/tools/:slug", permanent: false },
        { source: "/assistant", destination: "/en/assistant", permanent: false },
      ];
    },
    async headers() {
      return [{ source: "/(.*)", headers: securityHeaders(isDev) }];
    },
  };
}
