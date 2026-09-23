import "server-only";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { hasDatabaseConfig, queryOne } from "@/lib/db/client";
import { hasSessionConfig, verifySessionToken, SESSION_COOKIE } from "@/lib/session";

/**
 * The admin gate: authentication AND authorization.
 *
 * Authentication alone is NOT enough here, and getting this wrong would be
 * the worst bug in the project -- unchanged from the Supabase version of
 * this file. The difference is only in HOW a session is authenticated:
 * previously a Supabase Auth JWT verified against Supabase's auth server,
 * now a locally-signed session cookie verified against AUTH_SECRET (see
 * src/lib/session.ts) plus a row in admin_credentials created either by the
 * bootstrap script or the invite-accept flow -- there is no public signup
 * endpoint at all in this version, which is a strictly narrower attack
 * surface than Supabase's default-open /auth/v1/signup ever was.
 *
 * So a session is only admin if its email clears one of two independent
 * checks (unchanged from Phase B, "Roles and invites"):
 *
 *   1. SUPER_ADMIN_EMAILS -- an env var, the bootstrap. A super admin
 *      defined outside the database cannot be created, promoted, or removed
 *      by anyone who compromises the database, because this code never
 *      reads super-admin status from a row.
 *   2. admin_users -- a table of ordinary admins, invited by a super admin
 *      (see src/app/admin/team/actions.ts). Presence in the table IS
 *      "active"; removing a row is how access is revoked.
 *
 * Fails CLOSED throughout. Unconfigured, unreachable, or an unlisted email
 * all resolve to "not an admin" -- never a 500, never a fall-through to the
 * protected page.
 */

export type AdminUser = { email: string };

function superAdminEmails(): string[] {
  return (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return superAdminEmails().includes(email.toLowerCase());
}

/** Every super-admin address from configuration, for the Team page's
 *  read-only "from configuration" list. Never editable from the UI. */
export function listSuperAdminEmails(): string[] {
  return superAdminEmails();
}

async function isInvitedAdmin(email: string): Promise<boolean> {
  try {
    const row = await queryOne<{ email: string }>(
      "select email from admin_users where email = $1",
      [email.toLowerCase()]
    );
    return Boolean(row);
  } catch (err) {
    console.error("[auth] admin_users lookup failed:", err);
    return false;
  }
}

async function isAdmin(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  if (isSuperAdminEmail(email)) return true;
  return isInvitedAdmin(email);
}

/** True once both the database and the session secret are configured --
 *  used by the login page to say "not available on this deployment" rather
 *  than offering a form that cannot work. */
export function hasAuthConfig(): boolean {
  return hasDatabaseConfig() && hasSessionConfig();
}

async function currentSessionEmail(): Promise<string | null> {
  if (!hasAuthConfig()) return null;
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const session = await verifySessionToken(token);
    return session?.email ?? null;
  } catch {
    return null;
  }
}

export async function requireAdmin(): Promise<AdminUser> {
  const user = await getAdminOrNull();
  // redirect() signals by throwing, so it is deliberately called OUTSIDE any
  // try/catch -- swallowing it would render the gate inert.
  if (!user) redirect("/admin/login");
  return user;
}

/** Non-redirecting variant, for Server Actions that return an error shape. */
export async function getAdminOrNull(): Promise<AdminUser | null> {
  const email = await currentSessionEmail();
  if (!email) return null;
  return (await isAdmin(email)) ? { email } : null;
}

/**
 * Roles/theme/(later) AI settings are super-admin only -- an invited
 * ordinary admin can manage the catalog but not who else can, and not the
 * brand. This redirects rather than 404ing so a demoted admin lands
 * somewhere sensible instead of a dead end.
 */
export async function requireSuperAdmin(): Promise<AdminUser> {
  const user = await requireAdmin();
  if (!isSuperAdminEmail(user.email)) redirect("/admin");
  return user;
}

/** Non-redirecting variant, for Server Actions. */
export async function getSuperAdminOrNull(): Promise<AdminUser | null> {
  const user = await getAdminOrNull();
  if (!user || !isSuperAdminEmail(user.email)) return null;
  return user;
}

/** True when the signed-in user exists but is not on the allowlist. */
export async function isSignedInButNotAdmin(): Promise<boolean> {
  const email = await currentSessionEmail();
  if (!email) return false;
  return !(await isAdmin(email));
}

/** Convenience bundle for presentational code (the admin nav) that needs to
 *  know who is signed in and whether they are a super admin, without
 *  duplicating the two checks above. Never used as the security boundary --
 *  every page and Server Action still calls requireAdmin()/requireSuperAdmin()
 *  itself. */
export async function getAdminContext(): Promise<{
  user: AdminUser;
  isSuperAdmin: boolean;
} | null> {
  const user = await getAdminOrNull();
  if (!user) return null;
  return { user, isSuperAdmin: isSuperAdminEmail(user.email) };
}
