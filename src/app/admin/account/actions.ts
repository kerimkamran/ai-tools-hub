"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { transaction } from "@/lib/db/client";
import { requirePermission } from "@/lib/auth";
import { MIN_PASSWORD_LENGTH, setPassword, verifyCredentials } from "@/lib/credentials";
import { issueSession } from "@/lib/sign-in";
import { audit } from "@/lib/audit";
import { SESSION_COOKIE } from "@/lib/session";

export type PasswordState = { error?: string; ok?: boolean };

const schema = z
  .object({
    current: z.string().min(1, "Enter your current password."),
    next: z.string().min(MIN_PASSWORD_LENGTH, `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`),
    confirm: z.string(),
  })
  .refine((v) => v.next === v.confirm, { message: "The new passwords do not match.", path: ["confirm"] })
  .refine((v) => v.next !== v.current, { message: "Choose a password different from the current one.", path: ["next"] });

/**
 * Change your own password. Re-verifies the current one through the same
 * rate-limited check as sign-in. Changing it bumps session_version, which
 * ends every OTHER session; this one is re-issued so you stay signed in.
 */
export async function changePassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const user = await requirePermission("self.manage");

  const parsed = schema.safeParse({
    current: String(formData.get("current") ?? ""),
    next: String(formData.get("next") ?? ""),
    confirm: String(formData.get("confirm") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };

  const check = await verifyCredentials(user.email, parsed.data.current, "admin");
  if (check.status === "locked") return { error: "Too many failed attempts. Try again in a few minutes." };
  if (check.status !== "ok") return { error: "The current password is not correct." };

  const sv = await transaction(async (tx) => {
    const v = await setPassword(tx, user.email, parsed.data.next);
    await audit(tx, { actor: user.email, action: "security.password_changed", area: "security", target: user.email });
    return v;
  });
  await issueSession(user.email, sv, user.session.mfa);
  return { ok: true };
}

export type SignOutState = { error?: string };

export async function signOutEverywhere(_prev: SignOutState, formData: FormData): Promise<SignOutState> {
  const user = await requirePermission("self.manage", { allowWithoutMfa: true });
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "SIGN OUT") {
    return { error: "Type SIGN OUT to confirm." };
  }
  await transaction(async (tx) => {
    await tx.query("update admin_credentials set session_version = session_version + 1 where email = $1", [user.email]);
    await audit(tx, { actor: user.email, action: "security.sign_out_everywhere", area: "security", target: user.email });
  });
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/admin/login");
}

export type NameState = { error?: string; ok?: boolean };

export async function saveDisplayName(_prev: NameState, formData: FormData): Promise<NameState> {
  const user = await requirePermission("self.manage");
  const name = z.string().trim().max(80).safeParse(formData.get("displayName") ?? "");
  if (!name.success) return { error: "Display name is too long." };
  await transaction(async (tx) => {
    await tx.query("update admin_credentials set display_name = nullif($2, '') where email = $1", [user.email, name.data]);
    await audit(tx, { actor: user.email, action: "accounts.display_name", area: "accounts", target: user.email, after: { displayName: name.data } });
  });
  return { ok: true };
}
