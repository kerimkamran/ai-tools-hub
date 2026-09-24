"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifyCredentials, verifySecondFactor, markSignedIn } from "@/lib/credentials";
import { afterPassword, issueSession } from "@/lib/sign-in";
import { MFA_PENDING_COOKIE, SESSION_COOKIE, safeNext, verifyPendingMfaToken } from "@/lib/session";
import { queryOne } from "@/lib/db/client";

/**
 * Public by necessity (these are how a person GETS a session), and listed in
 * PUBLIC_SERVER_ACTIONS in src/lib/permissions.ts.
 */

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const result = await verifyCredentials(email, password, "admin");
  if (result.status === "locked") redirect("/admin/login?error=locked");
  if (result.status !== "ok") redirect("/admin/login?error=1");

  redirect(await afterPassword(result, "/admin", "admin"));
}

export async function logout() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(MFA_PENDING_COOKIE);
  redirect("/admin/login");
}

/**
 * The code step for BOTH sign-in paths. Only the pre-MFA cookie (set after
 * a correct password, valid 10 minutes) gets a person here; a correct code
 * turns it into a session with mfa: true.
 */
export async function verifyMfa(formData: FormData) {
  const jar = await cookies();
  const pending = await verifyPendingMfaToken(jar.get(MFA_PENDING_COOKIE)?.value);
  if (!pending) redirect("/admin/login?error=expired");

  // The account must still be the same account the password was checked
  // against: a "sign out everywhere" in between ends this attempt too.
  const row = await queryOne<{ session_version: number; disabled: boolean }>(
    "select session_version, disabled_at is not null as disabled from admin_credentials where email = $1",
    [pending.email]
  );
  if (!row || row.disabled || row.session_version !== pending.sv) {
    jar.delete(MFA_PENDING_COOKIE);
    redirect("/admin/login?error=expired");
  }

  const result = await verifySecondFactor(pending.email, String(formData.get("code") ?? ""));
  if (result === "locked") {
    jar.delete(MFA_PENDING_COOKIE);
    redirect("/admin/login?error=locked");
  }
  if (result !== "ok") redirect("/admin/login/mfa?error=1");

  await issueSession(pending.email, pending.sv, true);
  await markSignedIn(pending.email, pending.next === "/admin" ? "admin" : "assistant", true);
  redirect(safeNext(pending.next));
}
