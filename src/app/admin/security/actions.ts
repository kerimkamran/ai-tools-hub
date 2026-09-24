"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { query, queryOne, transaction } from "@/lib/db/client";
import { requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { POLICY_BOUNDS, getSecurityPolicy } from "@/lib/security-policy";
import { openSecret, sealSecret } from "@/lib/secret-box";
import { newRecoveryCodes, newTotpSecret, verifyTotp } from "@/lib/totp";
import { hashRecoveryCode } from "@/lib/credentials";
import { issueSession } from "@/lib/sign-in";
import { mfaRequiredFor } from "@/lib/roles";
import { SESSION_COOKIE } from "@/lib/session";

// ---------------------------------------------------------------------------
// Security policy (super admin only)
// ---------------------------------------------------------------------------

export type PolicyState = { error?: string; ok?: boolean };

const bounded = (key: keyof typeof POLICY_BOUNDS) =>
  z.coerce.number().int().min(POLICY_BOUNDS[key][0]).max(POLICY_BOUNDS[key][1]);

const policySchema = z.object({
  idleMinutes: bounded("idleMinutes"),
  absoluteHours: bounded("absoluteHours"),
  lockoutThreshold: bounded("lockoutThreshold"),
  lockoutMinutes: bounded("lockoutMinutes"),
  mfaRequiredAdmins: z.boolean(),
});

export async function savePolicy(_prev: PolicyState, formData: FormData): Promise<PolicyState> {
  const user = await requirePermission("security.manage");
  const parsed = policySchema.safeParse({
    idleMinutes: formData.get("idleMinutes"),
    absoluteHours: formData.get("absoluteHours"),
    lockoutThreshold: formData.get("lockoutThreshold"),
    lockoutMinutes: formData.get("lockoutMinutes"),
    mfaRequiredAdmins: formData.get("mfaRequiredAdmins") === "on",
  });
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { error: `${String(i?.path[0] ?? "Value")}: outside the allowed range.` };
  }
  const p = parsed.data;
  if (p.idleMinutes > p.absoluteHours * 60) {
    return { error: "The idle limit cannot be longer than the absolute limit." };
  }
  const before = await getSecurityPolicy();
  await transaction(async (tx) => {
    await tx.query(
      `update security_policy set idle_minutes = $1, absolute_hours = $2, lockout_threshold = $3,
         lockout_minutes = $4, mfa_required_admins = $5, updated_at = now(), updated_by = $6 where id = 1`,
      [p.idleMinutes, p.absoluteHours, p.lockoutThreshold, p.lockoutMinutes, p.mfaRequiredAdmins, user.email]
    );
    await audit(tx, { actor: user.email, action: "security.policy_update", area: "security", target: "policy", before, after: p });
  });
  revalidatePath("/admin/security");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Your own MFA (every admin role)
// ---------------------------------------------------------------------------

export type MfaState = { error?: string; ok?: string; recoveryCodes?: string[] };

/** Step 1: create a secret (not yet active until a code confirms it). */
export async function startMfaSetup(): Promise<void> {
  const user = await requirePermission("self.manage", { allowWithoutMfa: true });
  const row = await queryOne<{ enabled: boolean }>(
    "select totp_enabled_at is not null as enabled from admin_credentials where email = $1",
    [user.email]
  );
  if (row?.enabled) redirect("/admin/security/mfa");
  await query("update admin_credentials set totp_secret_encrypted = $2 where email = $1", [
    user.email,
    sealSecret(newTotpSecret()),
  ]);
  redirect("/admin/security/mfa");
}

/** Step 2: confirm with a code; turns MFA on and hands out recovery codes once. */
export async function confirmMfaSetup(_prev: MfaState, formData: FormData): Promise<MfaState> {
  const user = await requirePermission("self.manage", { allowWithoutMfa: true });
  const row = await queryOne<{ secret: string | null; enabled: boolean; sv: number }>(
    `select totp_secret_encrypted as secret, totp_enabled_at is not null as enabled, session_version as sv
       from admin_credentials where email = $1`,
    [user.email]
  );
  if (!row || row.enabled) return { error: "MFA is already on." };
  const secret = openSecret(row.secret);
  if (!secret) return { error: "Start the setup again." };
  const step = verifyTotp(secret, String(formData.get("code") ?? ""), null);
  if (step === null) return { error: "That code did not match. Check the time on your phone and try the newest code." };

  const codes = newRecoveryCodes();
  await transaction(async (tx) => {
    await tx.query(
      `update admin_credentials set totp_enabled_at = now(), totp_last_step = $2, recovery_codes_hash = $3
        where email = $1`,
      [user.email, step, codes.map(hashRecoveryCode)]
    );
    await audit(tx, { actor: user.email, action: "security.mfa_enabled", area: "security", target: user.email });
  });
  // This session has now proven the second factor.
  await issueSession(user.email, row.sv, true);
  revalidatePath("/admin/security/mfa");
  return { ok: "Two-step verification is on.", recoveryCodes: codes };
}

export async function regenerateRecoveryCodes(_prev: MfaState, formData: FormData): Promise<MfaState> {
  const user = await requirePermission("self.manage");
  const row = await queryOne<{ secret: string | null; last: string | null }>(
    "select totp_secret_encrypted as secret, totp_last_step::text as last from admin_credentials where email = $1 and totp_enabled_at is not null",
    [user.email]
  );
  const secret = openSecret(row?.secret);
  if (!row || !secret) return { error: "MFA is not on." };
  const step = verifyTotp(secret, String(formData.get("code") ?? ""), row.last === null ? null : Number(row.last));
  if (step === null) return { error: "That code did not match." };
  const codes = newRecoveryCodes();
  await transaction(async (tx) => {
    await tx.query("update admin_credentials set recovery_codes_hash = $2, totp_last_step = $3 where email = $1", [
      user.email,
      codes.map(hashRecoveryCode),
      step,
    ]);
    await audit(tx, { actor: user.email, action: "security.recovery_codes_regenerated", area: "security", target: user.email });
  });
  return { ok: "New recovery codes. The old ones no longer work.", recoveryCodes: codes };
}

export async function disableOwnMfa(_prev: MfaState, formData: FormData): Promise<MfaState> {
  const user = await requirePermission("self.manage");
  if (mfaRequiredFor(user.role, user.session.policy.mfaRequiredAdmins)) {
    return { error: "MFA is required for your role, so it cannot be turned off." };
  }
  const row = await queryOne<{ secret: string | null; last: string | null }>(
    "select totp_secret_encrypted as secret, totp_last_step::text as last from admin_credentials where email = $1 and totp_enabled_at is not null",
    [user.email]
  );
  const secret = openSecret(row?.secret);
  if (!row || !secret) return { error: "MFA is not on." };
  if (verifyTotp(secret, String(formData.get("code") ?? ""), row.last === null ? null : Number(row.last)) === null) {
    return { error: "That code did not match." };
  }
  await transaction(async (tx) => {
    await tx.query(
      `update admin_credentials set totp_secret_encrypted = null, totp_enabled_at = null, totp_last_step = null,
         recovery_codes_hash = '{}', session_version = session_version + 1 where email = $1`,
      [user.email]
    );
    await audit(tx, { actor: user.email, action: "security.mfa_disabled", area: "security", target: user.email });
  });
  // Session version changed: every session ended, including this one.
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/admin/login");
}
