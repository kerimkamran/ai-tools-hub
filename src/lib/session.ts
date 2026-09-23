import "server-only";
import { SignJWT, jwtVerify } from "jose";

/**
 * Signs and verifies the admin session cookie. This REPLACES Supabase Auth's
 * session JWTs -- same shape (a short opaque cookie, verified server-side on
 * every request that matters), different issuer.
 *
 * jose (not Node's built-in crypto or `jsonwebtoken`) is used on purpose: it
 * works identically in the Node.js runtime (Server Actions, pages) and in
 * whatever runtime Proxy ends up using, with no polyfill. Signing is HMAC
 * (HS256) with a single shared secret -- there is exactly one issuer (this
 * app) and one verifier (this app), so there is no reason to reach for
 * asymmetric keys.
 *
 * This module answers ONLY "is this a validly-signed session for this
 * email" -- it says nothing about whether that email is actually an admin.
 * That authorization check is src/lib/auth.ts's job, same separation the
 * Supabase-backed version kept between "signed in" and "admin".
 */

export const SESSION_COOKIE = "admin_session";
const ALG = "HS256";
const SESSION_LIFETIME = "30d";

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    // Fails loudly rather than silently signing with an empty/weak key --
    // an under-length secret is brute-forceable and must never be treated
    // as "configured".
    throw new Error(
      "AUTH_SECRET is not configured (or is shorter than 32 characters). Generate one with: openssl rand -base64 32"
    );
  }
  return new TextEncoder().encode(secret);
}

export function hasSessionConfig(): boolean {
  return Boolean(process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32);
}

export async function createSessionToken(email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(SESSION_LIFETIME)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<{ email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: [ALG] });
    if (typeof payload.email !== "string" || !payload.email) return null;
    return { email: payload.email };
  } catch {
    // Expired, malformed, or signed with a different secret -- all the same
    // "not signed in" outcome to callers, never a thrown error.
    return null;
  }
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30, // 30 days, matches SESSION_LIFETIME above
};
