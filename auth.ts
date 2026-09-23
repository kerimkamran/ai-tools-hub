import "server-only";
import { redirect } from "next/navigation";
import { createAuthClient, hasSupabaseConfig } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { User } from "@supabase/supabase-js";

/**
 * The admin gate: authentication AND authorization.
 *
 * Authentication alone is NOT enough here, and getting this wrong would be the
 * worst bug in the project. A Supabase project accepts public signups at
 * /auth/v1/signup by default, so "is this a valid Supabase user?" is a question
 * any stranger can make the answer to. On a public, indexed site that would
 * hand the catalog to anyone willing to register.
 *
 * So a session is only admin if its email clears one of two independent
 * checks (Phase B, "Roles and invites"):
 *
 *   1. SUPER_ADMIN_EMAILS -- an env var, the bootstrap. A super admin
 *      defined outside the database cannot be created, promoted, or removed
 *      by anyone who compromises the database, because this code never
 *      reads super-admin status from a row.
 *   2. admin_users -- a table of ordinary admins, invited by a super admin
 *      (see src/app/admin/team/actions.ts). Presence in the table IS
 *      "active"; removing a row is how access is revoked.
 *
 * Also turn off public signups in the Supabase dashboard (Authentication →
 * Providers → Email → disable "Allow new users to sign up"). Belt and
 * braces: either control alone would do, and neither is worth relying on by
 * itself.
 *
 * Fails CLOSED throughout. Unconfigured, unreachable, or an unlisted email
 * all resolve to "not an admin" -- never a 500, never a fall-through to the
 * protected page. An empty SUPER_ADMIN_EMAILS and an empty/unreachable
 * admin_users table together resolve to nobody being an admin -- exactly
 * like the original ADMIN_EMAILS-only behaviour this replaces.
 */

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
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("admin_users")
      .select("email")
      .eq("email", email.toLowerCase())
      .maybeSingle();
    if (error) {
      console.error("[auth] admin_users lookup failed:", error.message);
      return false;
    }
    return Boolean(data);
  } catch (err) {
    console.error("[auth] admin_users lookup threw:", err);
    return false;
  }
}

async function isAdmin(user: User | null): Promise<boolean> {
  if (!user?.email) return false;
  if (isSuperAdminEmail(user.email)) return true;
  return isInvitedAdmin(user.email);
}

export async function requireAdmin(): Promise<User> {
  const user = await getAdminOrNull();
  // redirect() signals by throwing, so it is deliberately called OUTSIDE any
  // try/catch -- swallowing it would render the gate inert.
  if (!user) redirect("/admin/login");
  return user;
}

/** Non-redirecting variant, for Server Actions that return an error shape. */
export async function getAdminOrNull(): Promise<User | null> {
  if (!hasSupabaseConfig()) return null;
  try {
    const supabase = await createAuthClient();
    // getUser() verifies the JWT with the auth server. getSession() would only
    // decode whatever cookie the browser happened to send.
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return (await isAdmin(data.user)) ? data.user : null;
  } catch {
    return null;
  }
}

/**
 * Roles/theme/(later) AI settings are super-admin only -- an invited
 * ordinary admin can manage the catalog but not who else can, and not the
 * brand. This redirects rather than 404ing so a demoted admin lands
 * somewhere sensible instead of a dead end.
 */
export async function requireSuperAdmin(): Promise<User> {
  const user = await requireAdmin();
  if (!isSuperAdminEmail(user.email)) redirect("/admin");
  return user;
}

/** Non-redirecting variant, for Server Actions. */
export async function getSuperAdminOrNull(): Promise<User | null> {
  const user = await getAdminOrNull();
  if (!user || !isSuperAdminEmail(user.email)) return null;
  return user;
}

/** True when the signed-in user exists but is not on the allowlist. */
export async function isSignedInButNotAdmin(): Promise<boolean> {
  if (!hasSupabaseConfig()) return false;
  try {
    const supabase = await createAuthClient();
    const { data } = await supabase.auth.getUser();
    return Boolean(data.user) && !(await isAdmin(data.user));
  } catch {
    return false;
  }
}

/** Convenience bundle for presentational code (the admin nav) that needs to
 *  know who is signed in and whether they are a super admin, without
 *  duplicating the two checks above. Never used as the security boundary --
 *  every page and Server Action still calls requireAdmin()/requireSuperAdmin()
 *  itself. */
export async function getAdminContext(): Promise<{
  user: User;
  isSuperAdmin: boolean;
} | null> {
  const user = await getAdminOrNull();
  if (!user) return null;
  return { user, isSuperAdmin: isSuperAdminEmail(user.email) };
}
