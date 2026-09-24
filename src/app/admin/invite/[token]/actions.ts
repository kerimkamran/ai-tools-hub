"use server";

import { redirect } from "next/navigation";
import { createHash } from "node:crypto";
import { z } from "zod";
import { transaction } from "@/lib/db/client";
import { MIN_PASSWORD_LENGTH, setPassword } from "@/lib/credentials";
import { isAdminEmail } from "@/lib/auth";
import { audit } from "@/lib/audit";

/**
 * Setup and reset links -- the Render replacement for emailed links. The
 * token (never a session) is the only credential this trusts, so it is
 * public by necessity (PUBLIC_SERVER_ACTIONS). It works exactly once: the
 * token row is deleted in the same transaction that sets the password, and
 * the conditional delete means a second, concurrent use finds nothing.
 * Setting the password bumps session_version, so a reset also ends every
 * session the account had.
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

export async function acceptInvite(_prev: AcceptState, formData: FormData): Promise<AcceptState> {
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

  const email = await transaction(async (tx) => {
    const row = await tx.queryOne<{ email: string; purpose: string }>(
      `delete from invite_tokens where token_hash = $1 and expires_at > now()
       returning email, purpose`,
      [tokenHash]
    );
    if (!row) return null;
    const exists = await tx.queryOne<{ disabled: boolean }>(
      "select disabled_at is not null as disabled from admin_credentials where email = $1",
      [row.email]
    );
    if (!exists || exists.disabled) return null;
    await setPassword(tx, row.email, password);
    await audit(tx, {
      actor: row.email,
      action: row.purpose === "reset" ? "accounts.password_reset_used" : "accounts.setup_completed",
      area: "accounts",
      target: row.email,
    });
    return row.email;
  });

  if (!email) return { error: "This link is invalid, expired or already used. Ask for a new one." };
  redirect((await isAdminEmail(email)) ? "/admin/login?invited=1" : "/en/assistant/login?invited=1");
}
