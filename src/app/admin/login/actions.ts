"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { verifyCredentials } from "@/lib/credentials";
import { createSessionToken, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/session";

/**
 * Replaces Supabase Auth's signInWithPassword(). The password check, the
 * timing-safe "no such user" path and the database-backed lockout live in
 * src/lib/credentials.ts, shared with the assistant's staff sign-in.
 */
export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const result = await verifyCredentials(email, password);
  if (result === "locked") redirect("/admin/login?error=locked");
  if (result !== "ok") redirect("/admin/login?error=1");

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
