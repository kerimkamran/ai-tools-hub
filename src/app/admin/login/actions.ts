"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { query, queryOne } from "@/lib/db/client";
import { createSessionToken, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/session";

/**
 * Replaces Supabase Auth's signInWithPassword(). Supabase applied its own
 * rate limiting to that endpoint; this version rolls a minimal equivalent
 * directly in admin_credentials (failed_attempts/locked_until) so it works
 * the same way whether Render runs one instance or several -- the counter
 * lives in the database, not in this process's memory.
 */

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

// A fixed, known-invalid bcrypt hash to compare against when no matching
// account exists. Without this, a request for a real email takes measurably
// longer (a real bcrypt compare) than one for a fake email (no compare at
// all) -- a timing side-channel that turns into an account-enumeration
// oracle. Comparing against this dummy hash keeps the response time the
// same shape either way.
const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEeO2ZqB7c3F7C1zP4kKt6XkKJZ9YQ0m8jS";

type CredentialRow = {
  email: string;
  password_hash: string;
  failed_attempts: number;
  locked_until: string | null;
};

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) redirect("/admin/login?error=1");

  const row = await queryOne<CredentialRow>(
    "select email, password_hash, failed_attempts, locked_until from admin_credentials where email = $1",
    [email]
  );

  if (!row) {
    // Deliberately generic: distinguishing "no such user" from "wrong
    // password" hands an attacker an account-enumeration oracle. Still runs
    // a compare against the dummy hash so this branch takes the same shape
    // of time as the real one below.
    await bcrypt.compare(password, DUMMY_HASH);
    redirect("/admin/login?error=1");
  }

  if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    redirect("/admin/login?error=locked");
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
    redirect(lockedUntil ? "/admin/login?error=locked" : "/admin/login?error=1");
  }

  await query(
    "update admin_credentials set failed_attempts = 0, locked_until = null where email = $1",
    [email]
  );

  const token = await createSessionToken(email);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);

  revalidatePath("/admin");
  redirect("/admin");
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect("/admin/login");
}
