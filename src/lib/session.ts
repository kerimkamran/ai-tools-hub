import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { queryOne } from "@/lib/db/client";
import { DEFAULT_POLICY, rowToPolicy, type SecurityPolicy } from "@/lib/security-policy";

/**
 * THE session verifier (Admin Panel Plan, capability 3).
 *
 * Every place that trusts a session -- src/proxy.ts, src/lib/auth.ts and
 * /api/assistant -- calls getVerifiedSession(). Nothing verifies the cookie
 * signature on its own any more, because a check that only looks at the
 * signature cannot see a revocation.
 *
 * One query checks, together:
 *   - the account still exists, has a password and is not disabled
 *   - session_version matches (bumped by "sign out everywhere", a password
 *     change, a role change, disabling and removal -- so any of those ends
 *     every existing cookie at once)
 *   - the idle limit (time since the cookie was last issued)
 *   - the absolute limit (time since the person actually signed in, carried
 *     in the auth_time claim `at`, which a refresh never moves)
 *
 * Signing is HMAC (HS256) with AUTH_SECRET: one issuer, one verifier.
 */

export const SESSION_COOKIE = "admin_session";
export const MFA_PENDING_COOKIE = "mfa_pending";
const ALG = "HS256";
/** Re-issue (slide) a cookie at most this often. */
const REFRESH_AFTER_SECONDS = 5 * 60;
const MFA_PENDING_SECONDS = 10 * 60;

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET is not configured (or is shorter than 32 characters). Generate one with: openssl rand -base64 32"
    );
  }
  return new TextEncoder().encode(secret);
}

export function hasSessionConfig(): boolean {
  return Boolean(process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32);
}

export type SessionClaims = {
  email: string;
  /** session_version at the time the session began */
  sv: number;
  /** auth_time: when the person signed in (seconds). Refreshes keep it. */
  at: number;
  /** true once a TOTP or recovery code was verified for this session */
  mfa: boolean;
};

export type VerifiedSession = SessionClaims & {
  /** when this cookie was issued (seconds) */
  iat: number;
  refreshDue: boolean;
  policy: SecurityPolicy;
};

const now = () => Math.floor(Date.now() / 1000);

export async function createSessionToken(c: SessionClaims, policy: SecurityPolicy = DEFAULT_POLICY): Promise<string> {
  return new SignJWT({ email: c.email, sv: c.sv, at: c.at, mfa: c.mfa, typ: "session" })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(c.at + policy.absoluteHours * 3600)
    .sign(secretKey());
}

async function decode(token: string, typ: string): Promise<Record<string, unknown> | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: [ALG] });
    if (payload.typ !== typ) return null;
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

type VerifyRow = {
  session_version: number;
  disabled: boolean;
  has_password: boolean;
  idle_minutes: number | null;
  absolute_hours: number | null;
  mfa_required_admins: boolean | null;
  lockout_threshold: number | null;
  lockout_minutes: number | null;
};

export async function getVerifiedSession(token: string | null | undefined): Promise<VerifiedSession | null> {
  if (!token || !hasSessionConfig() || !process.env.DATABASE_URL) return null;
  const p = await decode(token, "session");
  if (!p) return null;
  const email = typeof p.email === "string" ? p.email.toLowerCase() : "";
  const sv = typeof p.sv === "number" ? p.sv : NaN;
  const at = typeof p.at === "number" ? p.at : NaN;
  const iat = typeof p.iat === "number" ? p.iat : NaN;
  if (!email || !Number.isFinite(sv) || !Number.isFinite(at) || !Number.isFinite(iat)) return null;

  let row: VerifyRow | null;
  try {
    row = await queryOne<VerifyRow>(
      `select c.session_version, c.disabled_at is not null as disabled,
              c.password_hash is not null as has_password,
              p.idle_minutes, p.absolute_hours, p.mfa_required_admins,
              p.lockout_threshold, p.lockout_minutes
         from admin_credentials c
         left join security_policy p on p.id = 1
        where c.email = $1`,
      [email]
    );
  } catch {
    return null; // fail closed
  }
  if (!row || row.disabled || !row.has_password || row.session_version !== sv) return null;

  const policy = row.idle_minutes === null ? DEFAULT_POLICY : rowToPolicy(row as Parameters<typeof rowToPolicy>[0]);
  const t = now();
  if (t - iat > policy.idleMinutes * 60) return null;
  if (t - at > policy.absoluteHours * 3600) return null;

  return { email, sv, at, mfa: p.mfa === true, iat, refreshDue: t - iat > REFRESH_AFTER_SECONDS, policy };
}

/** A fresh cookie for the same session: same auth time, version and MFA state. */
export async function refreshSessionToken(s: VerifiedSession): Promise<string> {
  return createSessionToken({ email: s.email, sv: s.sv, at: s.at, mfa: s.mfa }, s.policy);
}

export function sessionCookieOptions(policy: SecurityPolicy, authTime: number) {
  const remaining = Math.max(60, authTime + policy.absoluteHours * 3600 - now());
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: remaining,
  };
}

// ---- The short-lived cookie between the password step and the code step ----

export type PendingMfa = { email: string; sv: number; next: string };

export async function createPendingMfaToken(p: PendingMfa): Promise<string> {
  return new SignJWT({ email: p.email, sv: p.sv, next: p.next, typ: "mfa_pending" })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(now() + MFA_PENDING_SECONDS)
    .sign(secretKey());
}

export async function verifyPendingMfaToken(token: string | null | undefined): Promise<PendingMfa | null> {
  if (!token || !hasSessionConfig()) return null;
  const p = await decode(token, "mfa_pending");
  if (!p || typeof p.email !== "string" || typeof p.sv !== "number" || typeof p.next !== "string") return null;
  return { email: p.email, sv: p.sv, next: p.next };
}

export const PENDING_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: MFA_PENDING_SECONDS,
};

/** Where a signed-in person may be sent after the code step. Never an open redirect. */
export function safeNext(next: string | null | undefined): string {
  if (next === "/admin") return "/admin";
  if (next && /^\/(en|az|ru)\/assistant$/.test(next)) return next;
  return "/admin";
}
