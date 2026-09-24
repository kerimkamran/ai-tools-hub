"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifyCredentials } from "@/lib/credentials";
import { afterPassword } from "@/lib/sign-in";
import { MFA_PENDING_COOKIE, SESSION_COOKIE } from "@/lib/session";
import { toLocale, localePath } from "@/lib/i18n";

/**
 * Staff sign-in for the assistant. Public by necessity (listed in
 * PUBLIC_SERVER_ACTIONS). Same credential table, lockout and timing-safe
 * check as the admin sign-in; an account with MFA goes through the same
 * code step (/admin/login/mfa), so this form cannot be used to skip MFA.
 */
export async function assistantLogin(formData: FormData) {
  const locale = toLocale(formData.get("locale"));
  const base = localePath(locale, "/assistant");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const result = await verifyCredentials(email, password, "assistant");
  if (result.status === "locked") redirect(`${base}/login?error=locked`);
  if (result.status !== "ok") redirect(`${base}/login?error=1`);

  redirect(await afterPassword(result, base, "assistant"));
}

export async function assistantLogout(formData: FormData) {
  const locale = toLocale(formData.get("locale"));
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(MFA_PENDING_COOKIE);
  redirect(localePath(locale, "/assistant/login"));
}
