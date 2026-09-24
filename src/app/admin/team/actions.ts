"use server";

import { revalidatePath } from "next/cache";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { query, queryOne } from "@/lib/db/client";
import { getSuperAdminOrNull, isSuperAdminEmail } from "@/lib/auth";
import { siteUrl } from "@/lib/site";

/**
 * Roles are super-admin only (see src/lib/auth.ts's doc comment on
 * requireSuperAdmin). Every action here re-checks that itself -- it does
 * NOT rely on the page having already gated the request, matching the same
 * discipline src/app/admin/actions.ts uses for the catalog.
 */

export type InviteState = { error?: string; ok?: boolean; inviteUrl?: string };

const emailSchema = z.string().trim().toLowerCase().email();

const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function inviteAdmin(
  _prev: InviteState,
  formData: FormData
): Promise<InviteState> {
  const superAdmin = await getSuperAdminOrNull();
  if (!superAdmin?.email) return { error: "Not signed in as a super admin." };

  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Enter a valid email address." };
  const email = parsed.data;

  if (isSuperAdminEmail(email)) {
    return { error: "That address is already a super admin (set via configuration)." };
  }

  // Presence in admin_users grants the role immediately, exactly as before
  // -- the invite link only lets them SET A PASSWORD, it does not gate
  // access on its own. Someone re-invited gets a fresh link; their existing
  // access (if any) is untouched.
  await query(
    `insert into admin_users (email, invited_by) values ($1, $2)
     on conflict (email) do nothing`,
    [email, superAdmin.email.toLowerCase()]
  );

  // No password is emailed -- Render cannot send mail. Instead a one-time
  // link is generated here and shown to the super admin to copy and share
  // themselves. Only the SHA-256 hash is stored; the plaintext token exists
  // only in this response and is never logged or persisted.
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + INVITE_LIFETIME_MS).toISOString();

  // One active invite link per email -- re-inviting rotates the link rather
  // than leaving old ones usable alongside it.
  await query("delete from invite_tokens where email = $1", [email]);
  await query(
    `insert into invite_tokens (token_hash, email, created_by, expires_at)
     values ($1, $2, $3, $4)`,
    [tokenHash, email, superAdmin.email.toLowerCase(), expiresAt]
  );

  revalidatePath("/admin/team");
  return { ok: true, inviteUrl: `${siteUrl()}/admin/invite/${token}` };
}

export type RemoveState = { error?: string };

export async function removeAdmin(
  _prev: RemoveState,
  formData: FormData
): Promise<RemoveState> {
  const superAdmin = await getSuperAdminOrNull();
  if (!superAdmin) return { error: "Not signed in as a super admin." };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "No admin specified." };

  if (isSuperAdminEmail(email)) {
    // Should not be reachable from the UI (super admins are never listed
    // with a remove button), but the action re-checks anyway rather than
    // trusting the form.
    return { error: "Super admins are managed via configuration, not here." };
  }

  // This revokes admin ACCESS only -- presence in admin_users is "active",
  // per the migration's own comment -- and does not touch their password
  // credential in admin_credentials. Deleting the credential itself is a
  // heavier, separate operation this action deliberately does not perform,
  // matching the Supabase version's choice not to delete the Auth account.
  const row = await queryOne<{ email: string }>(
    "delete from admin_users where email = $1 returning email",
    [email]
  );
  if (!row) return { error: "That admin no longer exists." };

  revalidatePath("/admin/team");
  return {};
}

// ---------------------------------------------------------------------------
// Staff -- assistant access only (Phase D).
// ---------------------------------------------------------------------------

/** The staff domain rule. Enforced here BEFORE any write, and again by the
 *  staff_users CHECK constraint (db/migrations/0005_assistant.sql). */
const STAFF_DOMAIN = "@azerconnect.az";

export async function inviteStaff(
  _prev: InviteState,
  formData: FormData
): Promise<InviteState> {
  const superAdmin = await getSuperAdminOrNull();
  if (!superAdmin?.email) return { error: "Not signed in as a super admin." };

  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Enter a valid email address." };
  const email = parsed.data;

  if (!email.endsWith(STAFF_DOMAIN)) {
    return { error: `Assistant access is for ${STAFF_DOMAIN} addresses only.` };
  }

  await query(
    `insert into staff_users (email, invited_by) values ($1, $2)
     on conflict (email) do nothing`,
    [email, superAdmin.email.toLowerCase()]
  );

  // Someone who already has a password (an admin, or re-invited staff) does
  // not need a link -- access is granted by the row above.
  const hasPassword = await queryOne<{ email: string }>(
    "select email from admin_credentials where email = $1",
    [email]
  );
  revalidatePath("/admin/team");
  if (hasPassword) return { ok: true };

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + INVITE_LIFETIME_MS).toISOString();
  await query("delete from invite_tokens where email = $1", [email]);
  await query(
    `insert into invite_tokens (token_hash, email, created_by, expires_at)
     values ($1, $2, $3, $4)`,
    [tokenHash, email, superAdmin.email.toLowerCase(), expiresAt]
  );

  return { ok: true, inviteUrl: `${siteUrl()}/admin/invite/${token}` };
}

export async function removeStaff(
  _prev: RemoveState,
  formData: FormData
): Promise<RemoveState> {
  const superAdmin = await getSuperAdminOrNull();
  if (!superAdmin) return { error: "Not signed in as a super admin." };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "No staff member specified." };

  const row = await queryOne<{ email: string }>(
    "delete from staff_users where email = $1 returning email",
    [email]
  );
  if (!row) return { error: "That staff member no longer exists." };

  revalidatePath("/admin/team");
  return {};
}
