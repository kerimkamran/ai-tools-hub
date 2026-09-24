"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifyCredentials } from "@/lib/credentials";
import { createSessionToken, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/session";
import { toLocale, localePath } from "@/lib/i18n";

/**
 * Staff sign-in for the assistant. Same credential table, same lockout and
 * the same timing-safe check as the admin sign-in (src/lib/credentials.ts);
 * what the session may then reach is decided per route in src/lib/auth.ts.
 */
export async function assistantLogin(formData: FormData) {
  const locale = toLocale(formData.get("locale"));
  const base = localePath(locale, "/assistant");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const result = await verifyCredentials(email, password);
  if (result === "locked") redirect(`${base}/login?error=locked`);
  if (result !== "ok") redirect(`${base}/login?error=1`);

  const token = await createSessionToken(email);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
  redirect(base);
}

export async function assistantLogout(formData: FormData) {
  const locale = toLocale(formData.get("locale"));
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect(localePath(locale, "/assistant/login"));
}
