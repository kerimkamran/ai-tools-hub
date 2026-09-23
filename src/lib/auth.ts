import "server-only";
import { redirect } from "next/navigation";
import { createAuthClient, hasSupabaseConfig } from "@/lib/supabase/server";

/**
 * The actual admin gate.
 *
 * The proxy also redirects anonymous visitors away from /admin, but that is a
 * convenience, not the boundary. Next.js has shipped middleware/proxy-bypass
 * advisories before (see the 16.3.6 pin), so every admin page and every
 * mutating Server Action calls this directly. A gate that exists only in the
 * proxy is a gate that can be walked around.
 *
 * Uses getUser(), which verifies the JWT against the auth server, rather than
 * getSession(), which only decodes whatever cookie the browser happened to
 * send.
 *
 * Fails CLOSED. If Supabase is unconfigured or unreachable, this resolves to
 * "not an admin" and sends the visitor to the login screen -- it must never
 * surface a 500 (which leaks that something server-side broke) and must never
 * fall through to the protected page.
 */
export async function requireAdmin() {
  const user = await getAdminOrNull();
  // redirect() throws a control-flow signal, so it is deliberately called
  // OUTSIDE any try/catch -- swallowing it would render the gate inert.
  if (!user) redirect("/admin/login");
  return user;
}

/** Non-redirecting variant, for Server Actions that return an error shape. */
export async function getAdminOrNull() {
  if (!hasSupabaseConfig()) return null;
  try {
    const supabase = await createAuthClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data.user ?? null;
  } catch {
    return null;
  }
}
