import "server-only";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { hasDatabaseConfig } from "@/lib/db/client";
import { getVerifiedSession, hasSessionConfig, SESSION_COOKIE, type VerifiedSession } from "@/lib/session";
import { can, isAdminRole, type Permission, type Role } from "@/lib/permissions";
import { isSuperAdminEmail, mfaRequiredFor, resolveRole, superAdminEmails } from "@/lib/roles";

/**
 * The server-side security boundary (Admin Panel Plan, engineering rule 1).
 *
 * Every admin page and every Server Action that is not on the public
 * allowlist (src/lib/permissions.ts) calls requirePermission(). It verifies
 * the session through the ONE verifier (src/lib/session.ts), resolves the
 * role (src/lib/roles.ts), checks the permission map, and enforces MFA on
 * the session. The proxy and the nav are conveniences, never the boundary.
 *
 * Fails closed throughout: unconfigured, unreachable, revoked, expired,
 * disabled or unlisted all resolve to "no".
 */

export { isSuperAdminEmail };

export type CurrentUser = {
  email: string;
  role: Role;
  session: VerifiedSession;
};

export function hasAuthConfig(): boolean {
  return hasDatabaseConfig() && hasSessionConfig();
}

export function listSuperAdminEmails(): string[] {
  return superAdminEmails();
}

async function currentSession(): Promise<VerifiedSession | null> {
  if (!hasAuthConfig()) return null;
  try {
    const jar = await cookies();
    return await getVerifiedSession(jar.get(SESSION_COOKIE)?.value);
  } catch {
    return null;
  }
}

/** The signed-in person (any role, including staff), or null. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await currentSession();
  if (!session) return null;
  const role = await resolveRole(session.email);
  if (!role) return null;
  return { email: session.email, role, session };
}

export function needsMfa(user: CurrentUser): boolean {
  return mfaRequiredFor(user.role, user.session.policy.mfaRequiredAdmins) && !user.session.mfa;
}

/**
 * The boundary. Redirects (which throws, so it is never inside a
 * try/catch) when:
 *   - there is no valid session, or the role cannot enter /admin -> /admin/login
 *   - MFA is required but this session has no MFA -> /admin/security/mfa
 *   - the role lacks this permission -> /admin
 *
 * `allowWithoutMfa` is only for the MFA set-up page itself (and sign-out),
 * which a person must reach in order to satisfy the requirement.
 */
export async function requirePermission(
  permission: Permission,
  opts: { allowWithoutMfa?: boolean } = {}
): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role)) redirect("/admin/login");
  if (!opts.allowWithoutMfa && needsMfa(user)) redirect("/admin/security/mfa");
  if (!can(user.role, permission)) redirect("/admin");
  return user;
}

/** Non-throwing check for conditional UI inside an already-gated page. */
export function userCan(user: CurrentUser | null, permission: Permission): boolean {
  return Boolean(user && can(user.role, permission));
}

/** For the admin nav: who is signed in, never the boundary. */
export async function getAdminContext(): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role)) return null;
  return user;
}

/** Signed in with a real session, but not a role that can enter /admin. */
export async function isSignedInButNotAdmin(): Promise<boolean> {
  const session = await currentSession();
  if (!session) return false;
  return !isAdminRole(await resolveRole(session.email));
}

/** Admins and editors sign in to /admin after an invite; staff to the assistant. */
export async function isAdminEmail(email: string): Promise<boolean> {
  return isAdminRole(await resolveRole(email));
}

/** The assistant's gate: any role at all (super, admin, editor or staff). */
export async function getAssistantUserOrNull(): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  return user && can(user.role, "assistant.use") ? user : null;
}
