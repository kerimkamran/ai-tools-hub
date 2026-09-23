import type { NextConfig } from "next";

/**
 * Security headers.
 *
 * Ported from the Vantage (aiac-platform) header block so the hub and the
 * tools present a consistent posture, with two deliberate differences:
 *
 *  - connect-src does NOT allow any AI provider host. The hub makes zero
 *    model calls and holds zero provider keys; if a provider hostname ever
 *    needs to appear here, something has gone wrong.
 *  - frame-ancestors 'none' (plus X-Frame-Options) because nothing should
 *    ever embed the catalog either.
 *
 * script-src keeps 'unsafe-inline' because the App Router injects per-page
 * inline bootstrap scripts whose hashes vary, and a nonce-based policy would
 * force every route to render dynamically -- which would destroy the static,
 * cookie-free delivery that is the entire point of this page. This is the
 * same trade-off Vantage makes.
 */
const isDev = process.env.NODE_ENV === "development";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // React needs eval() for dev-mode debugging only. Production
      // never gets 'unsafe-eval' -- this is gated on NODE_ENV.
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
