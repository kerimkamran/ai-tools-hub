"use server";

import { redirect } from "next/navigation";
import { createHash } from "node:crypto";
import { z } from "zod";
import { query, queryOne } from "@/lib/db/client";
import { MIN_PASSWORD_LENGTH, setPassword } from "@/lib/credentials";
import { isAdminEmail } from "@/lib/auth";

/**
 * Accept-invite flow -- the Render replacement for Supabase's
 * inviteUserByEmail() magic link. The token itself (not a session) is the
 * only credential this action trusts; it deliberately does not call
 * getAdminOrNull() or any auth check, because the whole point is to let
 * someone WITHOUT a session set their first password.
 */

export type AcceptState = { error?: string };

const inputSchema = z
  .object({
    token: z.string().trim().min(1),
    password: z.string().min(MIN_PASSWORD_LENGTH, `Must be at least ${MIN_PASSWORD_LENGTH} characters.`),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords do not match.",
    path: ["confirm"],
  });

export async function acceptInvite(
  _prev: AcceptState,
  formData: FormData
): Promise<AcceptState> {
  const parsed = inputSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const { token, password } = parsed.data;

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const row = await queryOne<{ email: string; expires_at: string }>(
    "select email, expires_at from invite_tokens where token_hash = $1",
    [tokenHash]
  );

  if (!row) return { error: "This invite link is invalid. Ask for a new one." };
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await query("delete from invite_tokens where token_hash = $1", [tokenHash]);
    return { error: "This invite link has expired. Ask for a new one." };
  }

  await setPassword(row.email, password);

  // Single-use: the token cannot be replayed once a password is set.
  await query("delete from invite_tokens where token_hash = $1", [tokenHash]);

  // Admins sign in to /admin; staff (Phase D) sign in to the assistant.
  redirect((await isAdminEmail(row.email)) ? "/admin/login?invited=1" : "/en/assistant/login?invited=1");
}
