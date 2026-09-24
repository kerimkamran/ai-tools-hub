"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { verifyCredentials } from "@/lib/credentials";
import { afterPassword } from "@/lib/sign-in";
import { MFA_PENDING_COOKIE, SESSION_COOKIE } from "@/lib/session";
import { toLocale, localePath } from "@/lib/i18n";
import { transaction, type Tx } from "@/lib/db/client";
import { isStaffDomain } from "@/lib/security-policy";
import { isSuperAdminEmail } from "@/lib/roles";
import { createAccountLink } from "@/lib/accounts";
import { audit } from "@/lib/audit";
import { hasMailConfig, sendMail } from "@/lib/mailer";

/**
 * Staff sign-in for the assistant. Public by necessity (listed in
 * PUBLIC_SERVER_ACTIONS). Same credential table, lockout and timing-safe
 * check as the admin sign-in; an account with MFA goes through the same
 * code step (/admin/login/mfa), so this form cannot be used to skip MFA.
 */
export async function assistantLogin(formData: FormData) {
  const locale = toLocale(formData.get("locale"));
  const loginPath = localePath(locale, "/assistant/login");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const result = await verifyCredentials(email, password, "assistant");
  if (result.status === "locked") redirect(`${loginPath}?error=locked`);
  if (result.status !== "ok") redirect(`${loginPath}?error=1`);

  // Graham Bell lives on the home page itself, not a separate /assistant
  // route -- so a successful sign-in lands back there, chat now enabled.
  redirect(await afterPassword(result, localePath(locale), "assistant"));
}

export async function assistantLogout(formData: FormData) {
  const locale = toLocale(formData.get("locale"));
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(MFA_PENDING_COOKIE);
  redirect(localePath(locale, "/assistant/login"));
}

const requestEmailSchema = z.string().trim().toLowerCase().email().max(254);

export type RequestLinkState = { sent?: boolean; unavailable?: boolean; error?: string };

/**
 * Self-service: any address at one of the allowed domains (security-policy's
 * STAFF_DOMAINS) can ask for a sign-in link instead of waiting for an admin
 * invite -- for using the AI Assistant only. It reuses the exact one-time
 * invite_tokens flow the Accounts page already uses (src/lib/accounts.ts,
 * src/app/admin/invite/[token]) and emails the same kind of link that an
 * admin would otherwise copy and send by hand. It never creates or touches
 * an admin/editor account, and it never reveals whether an address already
 * has one -- the response is the same generic "check your email" either way.
 */
export async function requestAssistantLink(_prev: RequestLinkState, formData: FormData): Promise<RequestLinkState> {
  if (!hasMailConfig()) return { unavailable: true };

  const parsed = requestEmailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { error: "invalid" };
  const email = parsed.data;

  if (isSuperAdminEmail(email) || !isStaffDomain(email)) {
    // Same reply as a real, eligible address -- an ineligible or unknown
    // address must not be distinguishable from one an email was sent to.
    return { sent: true };
  }

  const url = await transaction(async (tx: Tx) => {
    const row = await tx.queryOne<{ has_password: boolean; disabled: boolean; is_admin: boolean }>(
      `select coalesce(c.password_hash is not null, false) as has_password,
              coalesce(c.disabled_at is not null, false) as disabled,
              exists (select 1 from admin_users where email = $1) as is_admin
         from (select $1::text as email) x
         left join admin_credentials c on c.email = x.email`,
      [email]
    );
    // Never touch an admin or editor account from this public, unauthenticated
    // flow, even if its address happens to sit at one of the staff domains.
    if (row?.is_admin || row?.disabled) return null;

    const recent = await tx.queryOne<{ recent: boolean }>(
      "select (max(created_at) > now() - interval '60 seconds') as recent from invite_tokens where email = $1",
      [email]
    );
    if (recent?.recent) return null; // already sent one moments ago -- don't spam the mailbox or the provider

    if (!row?.has_password) {
      await tx.query(
        "insert into admin_credentials (email) values ($1) on conflict (email) do nothing",
        [email]
      );
      await tx.query(
        "insert into staff_users (email, invited_by) values ($1, 'self-service') on conflict (email) do nothing",
        [email]
      );
    }
    const purpose = row?.has_password ? "reset" : "invite";
    const link = await createAccountLink(tx, email, purpose, "self-service");
    await audit(tx, {
      actor: email,
      action: "auth.self_serve_link_requested",
      area: "auth",
      target: email,
      after: { purpose },
    });
    return link;
  });

  if (url) {
    const result = await sendMail(
      email,
      "Your One.Simple sign-in link",
      `Open this link to sign in to the One.Simple AI Assistant:\n\n${url}\n\n` +
        "This link works once and expires in 7 days. If you didn't request this, you can ignore this email."
    );
    if (!result.ok) console.error("[assistant] mail send failed:", result.error);
  }

  return { sent: true };
}
