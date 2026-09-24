"use server";

import { z } from "zod";
import { getAdminOrNull } from "@/lib/auth";
import { MIN_PASSWORD_LENGTH, setPassword, verifyCredentials } from "@/lib/credentials";

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
 * Change your own password. Re-verifies the current one first (through the
 * same rate-limited check as sign-in, so this cannot be used to brute-force
 * it), and only ever touches the signed-in user's own row.
 */
export async function changePassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const admin = await getAdminOrNull();
  if (!admin) return { error: "Not signed in." };

  const parsed = schema.safeParse({
    current: String(formData.get("current") ?? ""),
    next: String(formData.get("next") ?? ""),
    confirm: String(formData.get("confirm") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };

  const check = await verifyCredentials(admin.email, parsed.data.current);
  if (check === "locked") return { error: "Too many failed attempts. Try again in a few minutes." };
  if (check !== "ok") return { error: "The current password is not correct." };

  await setPassword(admin.email, parsed.data.next);
  return { ok: true };
}
