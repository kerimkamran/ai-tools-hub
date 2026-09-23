import "server-only";
import { redirect } from "next/navigation";
import { createAuthClient, hasSupabaseConfig } from "@/lib/supabase/server";
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
 * So a session is only admin if its email is in ADMIN_EMAILS. Configure that,
 * AND turn off public signups in the Supabase dashboard (Authentication →
 * Providers → Email → disable "Allow new users to sign up"). Belt and braces:
 * either control alone would do, and neither is worth relying on by itself.
 *
 * Fails CLOSED. Unconfigured, unreachable, or an unlisted email all resolve to
 * "not an admin" -- never a 500, never a fall-through to the protected page.
 */

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function isAdmin(user: User | null): boolean {
  if (!user?.email) return false;
  const allowed = adminEmails();
  // An empty allowlist authorizes NOBODY. Defaulting to "allow all" when the
  // variable is missing is how this class of bug ships.
  if (allowed.length === 0) {
    console.error("[auth] ADMIN_EMAILS is not set; refusing all admin access.");
    return false;
  }
  return allowed.includes(user.email.toLowerCase());
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
    return isAdmin(data.user) ? data.user : null;
  } catch {
    return null;
  }
}

/** True when the signed-in user exists but is not on the allowlist. */
export async function isSignedInButNotAdmin(): Promise<boolean> {
  if (!hasSupabaseConfig()) return false;
  try {
    const supabase = await createAuthClient();
    const { data } = await supabase.auth.getUser();
    return Boolean(data.user) && !isAdmin(data.user);
  } catch {
    return false;
  }
}
