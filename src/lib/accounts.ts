import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { query, type Tx } from "@/lib/db/client";
import { siteUrl } from "@/lib/site";
import { superAdminEmails } from "@/lib/roles";
import type { Role } from "@/lib/permissions";

/**
 * Accounts (capability 1): one list of every account that can sign in.
 * admin_credentials is the account row; the role comes from
 * SUPER_ADMIN_EMAILS (super), admin_users (admin | editor) or staff_users.
 */

export type AccountStatus = "active" | "disabled" | "pending" | "locked";

export type Account = {
  email: string;
  displayName: string | null;
  role: Role | null;
  status: AccountStatus;
  mfa: boolean;
  lastSignInAt: string | null;
  envSuper: boolean;
  hasOpenLink: boolean;
};

type Row = {
  email: string;
  display_name: string | null;
  admin_role: "admin" | "editor" | null;
  staff: boolean;
  has_password: boolean;
  disabled: boolean;
  locked: boolean;
  mfa: boolean;
  last_sign_in_at: string | null;
  open_link: boolean;
};

export async function listAccounts(): Promise<Account[]> {
  const supers = superAdminEmails();
  const rows = await query<Row>(
    `with emails as (
       select email from admin_credentials
       union select email from admin_users
       union select email from staff_users
       union select unnest($1::text[])
     )
     select e.email,
            c.display_name,
            a.role as admin_role,
            (s.email is not null) as staff,
            coalesce(c.password_hash is not null, false) as has_password,
            coalesce(c.disabled_at is not null, false) as disabled,
            coalesce(c.locked_until > now(), false) as locked,
            coalesce(c.totp_enabled_at is not null, false) as mfa,
            c.last_sign_in_at,
            exists (select 1 from invite_tokens t where t.email = e.email and t.expires_at > now()) as open_link
       from emails e
       left join admin_credentials c on c.email = e.email
       left join admin_users a on a.email = e.email
       left join staff_users s on s.email = e.email
      order by e.email`,
    [supers]
  );
  const rank: Record<string, number> = { super: 0, admin: 1, editor: 2, staff: 3 };
  return rows
    .map((r) => {
      const envSuper = supers.includes(r.email);
      const role: Role | null = envSuper ? "super" : r.admin_role ?? (r.staff ? "staff" : null);
      const status: AccountStatus = r.disabled
        ? "disabled"
        : !r.has_password
          ? "pending"
          : r.locked
            ? "locked"
            : "active";
      return {
        email: r.email,
        displayName: r.display_name,
        role,
        status,
        mfa: r.mfa,
        lastSignInAt: r.last_sign_in_at,
        envSuper,
        hasOpenLink: r.open_link,
      };
    })
    .sort((a, b) => (rank[a.role ?? "x"] ?? 9) - (rank[b.role ?? "x"] ?? 9) || a.email.localeCompare(b.email));
}

const LINK_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * One active link per account: creating one revokes any earlier link. Only
 * the SHA-256 hash is stored; the plaintext exists only in the returned URL,
 * which the person creating it copies and sends themselves (Render cannot
 * send email). Never logged, never audited.
 */
export async function createAccountLink(
  tx: Tx,
  email: string,
  purpose: "invite" | "reset",
  createdBy: string
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + LINK_LIFETIME_MS).toISOString();
  await tx.query("delete from invite_tokens where email = $1", [email]);
  await tx.query(
    `insert into invite_tokens (token_hash, email, created_by, expires_at, purpose)
     values ($1, $2, $3, $4, $5)`,
    [tokenHash, email, createdBy.toLowerCase(), expiresAt, purpose]
  );
  return `${siteUrl()}/admin/invite/${token}`;
}

/** Ends every session of an account on its next request. */
export async function bumpSessionVersion(tx: Tx, email: string): Promise<void> {
  await tx.query(
    "update admin_credentials set session_version = session_version + 1 where email = $1",
    [email]
  );
}
