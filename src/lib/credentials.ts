import "server-only";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { query, queryOne, type Tx } from "@/lib/db/client";
import { getSecurityPolicy } from "@/lib/security-policy";
import { auditStandalone, countUnknownFailure } from "@/lib/audit";
import { openSecret } from "@/lib/secret-box";
import { normalizeRecoveryCode, verifyTotp } from "@/lib/totp";

/**
 * Password and second-factor checks, shared by BOTH sign-in paths (/admin
 * and the assistant). One table (admin_credentials = one row per account),
 * one lockout counter, one timing-safe path. Whether a verified session may
 * then reach /admin or the assistant is decided per request in
 * src/lib/auth.ts and src/proxy.ts.
 *
 * Lockout threshold and duration come from the security policy (bounded).
 * Failed MFA codes count toward the same lockout as failed passwords.
 */

export const MIN_PASSWORD_LENGTH = 12;

// A fixed, known-invalid bcrypt hash compared against when no usable account
// exists, so a missing account takes the same time as a wrong password.
const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEeO2ZqB7c3F7C1zP4kKt6XkKJZ9YQ0m8jS";

type AccountRow = {
  email: string;
  password_hash: string | null;
  failed_attempts: number;
  locked_until: string | null;
  disabled_at: string | null;
  session_version: number;
  totp_enabled_at: string | null;
};

export type VerifyResult =
  | { status: "ok"; email: string; sessionVersion: number; totpEnabled: boolean }
  | { status: "invalid" }
  | { status: "locked" };

async function registerFailure(email: string, reason: string, via: string): Promise<"invalid" | "locked"> {
  const policy = await getSecurityPolicy();
  const row = await queryOne<{ failed_attempts: number }>(
    // A lock that has already expired starts the count again from 1, so an
    // old lockout does not make the very next mistake lock the account.
    `with expired as (
       select (locked_until is not null and locked_until <= now()) as reset
         from admin_credentials where email = $1
     )
     update admin_credentials c set
       failed_attempts = case when e.reset then 1 else c.failed_attempts + 1 end,
       locked_until = case
         when (case when e.reset then 1 else c.failed_attempts + 1 end) >= $2
           then now() + ($3 || ' minutes')::interval
         when e.reset then null
         else c.locked_until end
     from expired e
     where c.email = $1
     returning c.failed_attempts`,
    [email, policy.lockoutThreshold, String(policy.lockoutMinutes)]
  );
  const locked = (row?.failed_attempts ?? 0) >= policy.lockoutThreshold;
  await auditStandalone({
    actor: email,
    action: locked ? "auth.locked" : "auth.sign_in_failed",
    area: "auth",
    target: email,
    after: { reason, via },
  });
  return locked ? "locked" : "invalid";
}

export async function verifyCredentials(emailRaw: string, password: string, via: "admin" | "assistant"): Promise<VerifyResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !password) return { status: "invalid" };

  const row = await queryOne<AccountRow>(
    `select email, password_hash, failed_attempts, locked_until, disabled_at, session_version, totp_enabled_at
       from admin_credentials where email = $1`,
    [email]
  );

  if (!row || !row.password_hash) {
    await bcrypt.compare(password, DUMMY_HASH);
    if (!row) await countUnknownFailure();
    else await auditStandalone({ actor: email, action: "auth.sign_in_failed", area: "auth", target: email, after: { reason: "no password set", via } });
    return { status: "invalid" };
  }

  if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    await bcrypt.compare(password, DUMMY_HASH);
    return { status: "locked" };
  }

  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) {
    const r = await registerFailure(email, "wrong password", via);
    return { status: r };
  }
  if (row.disabled_at) {
    // Same answer as a wrong password: never confirm an account exists.
    await auditStandalone({ actor: email, action: "auth.sign_in_failed", area: "auth", target: email, after: { reason: "disabled", via } });
    return { status: "invalid" };
  }

  return {
    status: "ok",
    email,
    sessionVersion: row.session_version,
    totpEnabled: Boolean(row.totp_enabled_at),
  };
}

/**
 * The code step. Accepts a 6-digit TOTP code (not replayable: the used step
 * is stored and anything at or before it is refused) or one of the 10
 * single-use recovery codes (removed once used).
 */
export async function verifySecondFactor(
  email: string,
  code: string
): Promise<"ok" | "invalid" | "locked"> {
  const row = await queryOne<{
    totp_secret_encrypted: string | null;
    totp_last_step: string | null;
    recovery_codes_hash: string[];
    locked_until: string | null;
    disabled_at: string | null;
  }>(
    `select totp_secret_encrypted, totp_last_step::text, recovery_codes_hash, locked_until, disabled_at
       from admin_credentials where email = $1`,
    [email]
  );
  if (!row || row.disabled_at) return "invalid";
  if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) return "locked";

  const secret = openSecret(row.totp_secret_encrypted);
  const trimmed = code.trim();

  if (secret && /^\d{3}\s?\d{3}$/.test(trimmed)) {
    const step = verifyTotp(secret, trimmed, row.totp_last_step === null ? null : Number(row.totp_last_step));
    if (step !== null) {
      // Conditional update: a concurrent request with the same code loses.
      const updated = await queryOne<{ email: string }>(
        `update admin_credentials set totp_last_step = $2, failed_attempts = 0, locked_until = null
          where email = $1 and (totp_last_step is null or totp_last_step < $2) returning email`,
        [email, step]
      );
      if (updated) return "ok";
    }
  } else if (trimmed.length >= 8) {
    const hash = hashRecoveryCode(trimmed);
    const updated = await queryOne<{ email: string }>(
      `update admin_credentials set recovery_codes_hash = array_remove(recovery_codes_hash, $2),
              failed_attempts = 0, locked_until = null
        where email = $1 and $2 = any(recovery_codes_hash) returning email`,
      [email, hash]
    );
    if (updated) {
      await auditStandalone({ actor: email, action: "auth.recovery_code_used", area: "auth", target: email });
      return "ok";
    }
  }

  return registerFailure(email, "wrong code", "mfa");
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}

/**
 * Sets (or replaces) the password. Bumps session_version, so every existing
 * session for this account ends -- the caller re-issues the current one if
 * the person changed their own password while signed in.
 */
export async function setPassword(tx: Tx, emailRaw: string, password: string): Promise<number> {
  const email = emailRaw.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);
  const row = await tx.queryOne<{ session_version: number }>(
    `insert into admin_credentials (email, password_hash, failed_attempts, locked_until)
     values ($1, $2, 0, null)
     on conflict (email) do update set
       password_hash = excluded.password_hash,
       failed_attempts = 0,
       locked_until = null,
       session_version = admin_credentials.session_version + 1
     returning session_version`,
    [email, passwordHash]
  );
  return row?.session_version ?? 1;
}

export async function markSignedIn(email: string, via: string, mfa: boolean): Promise<void> {
  await query("update admin_credentials set last_sign_in_at = now() where email = $1", [email]);
  await auditStandalone({ actor: email, action: "auth.sign_in", area: "auth", target: email, after: { via, mfa } });
}
