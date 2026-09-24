"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { transaction, type Tx } from "@/lib/db/client";
import { requirePermission, type CurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { isSuperAdminEmail, resolveRole } from "@/lib/roles";
import { audit } from "@/lib/audit";
import { bumpSessionVersion, createAccountLink } from "@/lib/accounts";
import { STAFF_DOMAIN } from "@/lib/security-policy";

/**
 * Accounts (capability 1). Every action here:
 *   - calls requirePermission() -- admins may act on STAFF accounts only;
 *     everything else needs a super admin
 *   - refuses to act on yourself where that would be a foot-gun (own role,
 *     own delete, own disable) and on env super admins (set via configuration)
 *   - writes exactly one audit row in the same transaction as the change
 *   - bumps session_version whenever access changes, so the change takes
 *     effect on the account's very next request
 */

export type AccountState = {
  error?: string;
  ok?: string;
  link?: string;
  links?: Array<{ email: string; link: string }>;
};

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const displayNameSchema = z.string().trim().max(80);
const roleSchema = z.enum(["admin", "editor", "staff"]);

type TargetRole = "super" | "admin" | "editor" | "staff" | null;

/**
 * The acting user must be allowed to manage an account with this role:
 * staff accounts need accounts.staff (admins and super admins), every other
 * account needs accounts.manage (super admins). Written inline at each call
 * site as `requirePermission(permissionFor(role))` so the static test in
 * tests/permissions.test.mts can see the check.
 */
function permissionFor(targetRole: TargetRole): "accounts.staff" | "accounts.manage" {
  return targetRole === "staff" ? "accounts.staff" : "accounts.manage";
}

async function snapshot(tx: Tx, email: string) {
  return tx.queryOne<{
    display_name: string | null;
    role: string | null;
    staff: boolean;
    disabled: boolean;
    mfa: boolean;
  }>(
    `select c.display_name,
            (select role from admin_users where email = $1) as role,
            exists (select 1 from staff_users where email = $1) as staff,
            c.disabled_at is not null as disabled,
            c.totp_enabled_at is not null as mfa
       from admin_credentials c where c.email = $1`,
    [email]
  );
}

async function accountExists(tx: Tx, email: string): Promise<boolean> {
  const r = await tx.queryOne<{ x: boolean }>(
    `select (exists (select 1 from admin_credentials where email = $1 and password_hash is not null)
          or exists (select 1 from admin_users where email = $1)
          or exists (select 1 from staff_users where email = $1)) as x`,
    [email]
  );
  return Boolean(r?.x);
}

async function insertAccount(
  tx: Tx,
  email: string,
  role: "admin" | "editor" | "staff",
  displayName: string,
  actor: string
) {
  await tx.query(
    `insert into admin_credentials (email, display_name) values ($1, nullif($2, ''))
     on conflict (email) do update set display_name = coalesce(nullif($2, ''), admin_credentials.display_name)`,
    [email, displayName]
  );
  if (role === "staff") {
    await tx.query(
      "insert into staff_users (email, invited_by) values ($1, $2) on conflict (email) do nothing",
      [email, actor]
    );
  } else {
    await tx.query(
      `insert into admin_users (email, invited_by, role) values ($1, $2, $3)
       on conflict (email) do update set role = excluded.role`,
      [email, actor, role]
    );
  }
}

export async function addAccount(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const role = roleSchema.safeParse(formData.get("role"));
  if (!role.success) return { error: "Choose a role." };
  const actor: CurrentUser = await requirePermission(permissionFor(role.data));

  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) return { error: "Enter a valid email address." };
  const displayName = displayNameSchema.safeParse(formData.get("displayName") ?? "");
  if (!displayName.success) return { error: "Display name is too long." };

  if (isSuperAdminEmail(email.data)) {
    return { error: "That address is a super admin, set via configuration." };
  }
  if (role.data === "staff" && !email.data.endsWith(STAFF_DOMAIN)) {
    return { error: `Staff accounts are for ${STAFF_DOMAIN} addresses only.` };
  }

  const link = await transaction(async (tx) => {
    // Never re-invite an existing account: a password reset is always the
    // separate, audited "Reset link" action.
    if (await accountExists(tx, email.data)) return null;
    await insertAccount(tx, email.data, role.data, displayName.data, actor.email);
    const url = await createAccountLink(tx, email.data, "invite", actor.email);
    await audit(tx, {
      actor: actor.email,
      action: "accounts.add",
      area: "accounts",
      target: email.data,
      after: { role: role.data, displayName: displayName.data || null },
    });
    return url;
  });

  if (!link) return { error: "That address already has an account. Use its Reset link instead." };
  revalidatePath("/admin/accounts");
  return { ok: `Account created for ${email.data}.`, link };
}

export async function bulkAddStaff(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const actor = await requirePermission("accounts.staff");
  const raw = String(formData.get("emails") ?? "");
  const list = [
    ...new Set(
      raw
        .split(/[\s,;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
  if (list.length === 0) return { error: "Paste at least one email address." };
  if (list.length > 200) return { error: "At most 200 addresses at a time." };
  const bad = list.filter((e) => !emailSchema.safeParse(e).success || !e.endsWith(STAFF_DOMAIN));
  if (bad.length) {
    return {
      error: `Not ${STAFF_DOMAIN} addresses: ${bad.slice(0, 5).join(", ")}${bad.length > 5 ? "…" : ""}`,
    };
  }

  const links: Array<{ email: string; link: string }> = [];
  const skipped: string[] = [];
  await transaction(async (tx) => {
    for (const e of list) {
      if (isSuperAdminEmail(e) || (await accountExists(tx, e))) {
        skipped.push(e);
        continue;
      }
      await insertAccount(tx, e, "staff", "", actor.email);
      links.push({ email: e, link: await createAccountLink(tx, e, "invite", actor.email) });
    }
    await audit(tx, {
      actor: actor.email,
      action: "accounts.bulk_add_staff",
      area: "accounts",
      target: `${links.length} accounts`,
      after: { added: links.map((l) => l.email), skipped },
    });
  });

  revalidatePath("/admin/accounts");
  return {
    ok: `Added ${links.length} staff account(s).${skipped.length ? ` Skipped ${skipped.length} that already exist.` : ""}`,
    links,
  };
}

export async function updateAccount(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) return { error: "No account specified." };
  const target = email.data;
  const currentRole = await resolveRole(target);
  const actor: CurrentUser = await requirePermission(permissionFor(currentRole));

  const displayName = displayNameSchema.safeParse(formData.get("displayName") ?? "");
  if (!displayName.success) return { error: "Display name is too long." };
  const newRoleRaw = formData.get("role");
  const newRole = newRoleRaw ? roleSchema.safeParse(newRoleRaw) : null;
  if (newRole && !newRole.success) return { error: "Unknown role." };
  const status = formData.get("status") === "disabled" ? "disabled" : "active";

  const envSuper = isSuperAdminEmail(target);
  const self = target === actor.email;
  const roleChange =
    newRole?.success && currentRole !== "super" && newRole.data !== currentRole ? newRole.data : null;

  if (roleChange && self) return { error: "You cannot change your own role." };
  if (roleChange && envSuper) return { error: "Super admins are set via configuration." };
  // Only a super admin changes roles; an admin managing staff cannot promote them.
  if (roleChange && !can(actor.role, "accounts.manage")) {
    return { error: "Only a super admin can change roles." };
  }
  if (roleChange === "staff" && !target.endsWith(STAFF_DOMAIN)) {
    return { error: `Staff accounts are for ${STAFF_DOMAIN} addresses only.` };
  }
  if (status === "disabled" && (self || envSuper)) {
    return {
      error: self ? "You cannot disable your own account." : "Super admins are set via configuration.",
    };
  }

  const done = await transaction(async (tx) => {
    const before = await snapshot(tx, target);
    if (!before) return false;
    await tx.query(
      "update admin_credentials set display_name = nullif($2, '') where email = $1",
      [target, displayName.data]
    );
    let accessChanged = false;
    if (roleChange) {
      await tx.query("delete from admin_users where email = $1", [target]);
      await tx.query("delete from staff_users where email = $1", [target]);
      if (roleChange === "staff") {
        await tx.query("insert into staff_users (email, invited_by) values ($1, $2)", [target, actor.email]);
      } else {
        await tx.query(
          "insert into admin_users (email, invited_by, role) values ($1, $2, $3)",
          [target, actor.email, roleChange]
        );
      }
      accessChanged = true;
    }
    if (status === "disabled" && !before.disabled) {
      await tx.query("update admin_credentials set disabled_at = now() where email = $1", [target]);
      await tx.query("delete from invite_tokens where email = $1", [target]);
      accessChanged = true;
    } else if (status === "active" && before.disabled) {
      await tx.query("update admin_credentials set disabled_at = null where email = $1", [target]);
      accessChanged = true;
    }
    if (accessChanged) await bumpSessionVersion(tx, target);
    await audit(tx, {
      actor: actor.email,
      action: "accounts.edit",
      area: "accounts",
      target,
      before,
      after: await snapshot(tx, target),
    });
    return true;
  });

  if (!done) return { error: "That account no longer exists." };
  revalidatePath("/admin/accounts");
  return { ok: "Saved." };
}

const OPS = ["reset_link", "unlock", "reset_mfa", "sign_out", "delete"] as const;

/**
 * Per-account actions from the row's action menu. Destructive ones
 * (delete, sign out everywhere) require the email typed back.
 */
export async function accountAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const op = z.enum(OPS).safeParse(formData.get("op"));
  const email = emailSchema.safeParse(formData.get("email"));
  if (!op.success || !email.success) return { error: "Unknown action." };
  const target = email.data;
  const targetRole = await resolveRole(target);
  const actor: CurrentUser = await requirePermission(permissionFor(targetRole));
  const envSuper = isSuperAdminEmail(target);
  const self = target === actor.email;
  const confirm = String(formData.get("confirm") ?? "").trim().toLowerCase();

  switch (op.data) {
    case "reset_link": {
      const link = await transaction(async (tx) => {
        const row = await tx.queryOne<{ has_password: boolean; disabled: boolean }>(
          `select password_hash is not null as has_password, disabled_at is not null as disabled
             from admin_credentials where email = $1`,
          [target]
        );
        if (!row || row.disabled) return null;
        const purpose = row.has_password ? "reset" : "invite";
        const url = await createAccountLink(tx, target, purpose, actor.email);
        await audit(tx, {
          actor: actor.email,
          action: purpose === "reset" ? "accounts.reset_link" : "accounts.setup_link",
          area: "accounts",
          target,
        });
        return url;
      });
      if (!link) return { error: "No active account for that address." };
      revalidatePath("/admin/accounts");
      return { ok: "Link created. It works once and expires in 7 days.", link };
    }
    case "unlock": {
      await transaction(async (tx) => {
        await tx.query(
          "update admin_credentials set failed_attempts = 0, locked_until = null where email = $1",
          [target]
        );
        await audit(tx, { actor: actor.email, action: "accounts.unlock", area: "accounts", target });
      });
      revalidatePath("/admin/accounts");
      return { ok: "Unlocked." };
    }
    case "reset_mfa": {
      if (!can(actor.role, "accounts.manage")) return { error: "Only a super admin can reset MFA." };
      await transaction(async (tx) => {
        await tx.query(
          `update admin_credentials set totp_secret_encrypted = null, totp_enabled_at = null,
             totp_last_step = null, recovery_codes_hash = '{}' where email = $1`,
          [target]
        );
        await bumpSessionVersion(tx, target);
        await audit(tx, { actor: actor.email, action: "accounts.reset_mfa", area: "accounts", target });
      });
      revalidatePath("/admin/accounts");
      return { ok: "MFA reset and all sessions ended. They set it up again at next sign-in." };
    }
    case "sign_out": {
      if (confirm !== target) return { error: "Type the email address to confirm." };
      await transaction(async (tx) => {
        await bumpSessionVersion(tx, target);
        await audit(tx, {
          actor: actor.email,
          action: "accounts.sign_out_everywhere",
          area: "accounts",
          target,
        });
      });
      revalidatePath("/admin/accounts");
      return { ok: "Signed out everywhere." };
    }
    case "delete": {
      if (self) return { error: "You cannot delete your own account." };
      if (envSuper) return { error: "Super admins are set via configuration." };
      if (confirm !== target) return { error: "Type the email address to confirm." };
      await transaction(async (tx) => {
        const before = await snapshot(tx, target);
        await tx.query("delete from invite_tokens where email = $1", [target]);
        await tx.query("delete from admin_users where email = $1", [target]);
        await tx.query("delete from staff_users where email = $1", [target]);
        // Deleting the account row is what ends every session: the single
        // verifier finds no row and rejects the cookie on its next request.
        await tx.query("delete from admin_credentials where email = $1", [target]);
        await audit(tx, { actor: actor.email, action: "accounts.delete", area: "accounts", target, before });
      });
      revalidatePath("/admin/accounts");
      return { ok: `Deleted ${target}. Their audit history is kept.` };
    }
  }
}
