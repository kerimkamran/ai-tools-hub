import "server-only";
import bcrypt from "bcryptjs";
import { query, queryOne } from "@/lib/db/client";

/**
 * Password checks shared by the admin sign-in and the assistant (staff)
 * sign-in. One table, one rate limiter, one timing-safe path -- two front
 * doors. Whether a verified email may then reach /admin or the assistant is
 * decided separately, in src/lib/auth.ts.
 *
 * The lockout counter lives in the database, so it holds across restarts and
 * across multiple Render instances.
 */

export const MIN_PASSWORD_LENGTH = 12;
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

// A fixed, known-invalid bcrypt hash compared against when no account
// exists. Without it, a real email takes measurably longer (a real bcrypt
// compare) than a fake one (no compare at all) -- a timing side-channel that
// becomes an account-enumeration oracle.
const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEeO2ZqB7c3F7C1zP4kKt6XkKJZ9YQ0m8jS";

type CredentialRow = {
  email: string;
  password_hash: string;
  failed_attempts: number;
  locked_until: string | null;
};

export type VerifyResult = "ok" | "invalid" | "locked";

export async function verifyCredentials(emailRaw: string, password: string): Promise<VerifyResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !password) return "invalid";

  const row = await queryOne<CredentialRow>(
    "select email, password_hash, failed_attempts, locked_until from admin_credentials where email = $1",
    [email]
  );

  if (!row) {
    await bcrypt.compare(password, DUMMY_HASH);
    return "invalid";
  }

  if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    return "locked";
  }

  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) {
    const attempts = row.failed_attempts + 1;
    const lockedUntil =
      attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null;
    await query(
      "update admin_credentials set failed_attempts = $2, locked_until = $3 where email = $1",
      [email, attempts, lockedUntil]
    );
    return lockedUntil ? "locked" : "invalid";
  }

  await query(
    "update admin_credentials set failed_attempts = 0, locked_until = null where email = $1",
    [email]
  );
  return "ok";
}

/** Sets (or replaces) the password for an email. Caller enforces who may. */
export async function setPassword(emailRaw: string, password: string): Promise<void> {
  const email = emailRaw.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);
  await query(
    `insert into admin_credentials (email, password_hash, failed_attempts, locked_until)
     values ($1, $2, 0, null)
     on conflict (email) do update set
       password_hash = excluded.password_hash,
       failed_attempts = 0,
       locked_until = null`,
    [email, passwordHash]
  );
}
