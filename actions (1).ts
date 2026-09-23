"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSuperAdminOrNull, isSuperAdminEmail } from "@/lib/auth";

/**
 * Roles are super-admin only (see src/lib/auth.ts's doc comment on
 * requireSuperAdmin). Every action here re-checks that itself -- it does
 * NOT rely on the page having already gated the request, matching the same
 * discipline src/app/admin/actions.ts uses for the catalog.
 */

export type InviteState = { error?: string; ok?: boolean };

const emailSchema = z.string().trim().toLowerCase().email();

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

  const admin = createAdminClient();

  // No password is emailed. inviteUserByEmail sends a one-time link the
  // invitee uses to set their own password -- nothing is generated, mailed,
  // logged, or seen by anyone else, including this server.
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email);
  if (inviteError) {
    // Supabase returns a generic-ish message for "already registered"; pass
    // it through rather than guessing, since the alternative is a silent
    // failure that looks like success.
    return { error: inviteError.message };
  }

  const { error: rowError } = await admin
    .from("admin_users")
    .upsert({ email, invited_by: superAdmin.email.toLowerCase() }, { onConflict: "email" });
  if (rowError) {
    return {
      error: `Invite sent, but could not record the admin role: ${rowError.message}. They can sign in, but will not have admin access until this is fixed.`,
    };
  }

  revalidatePath("/admin/team");
  return { ok: true };
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

  const admin = createAdminClient();
  // This revokes admin ACCESS only -- presence in admin_users is "active",
  // per the migration's own comment -- and does not touch their Supabase
  // Auth account. Deleting the account itself is a heavier, separate
  // operation this action deliberately does not perform.
  const { data, error } = await admin
    .from("admin_users")
    .delete()
    .eq("email", email)
    .select("email");
  if (error) return { error: `Could not remove: ${error.message}` };
  if (!data || data.length === 0) return { error: "That admin no longer exists." };

  revalidatePath("/admin/team");
  return {};
}
