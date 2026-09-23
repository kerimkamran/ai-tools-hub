import "server-only";
import { redirect } from "next/navigation";
import { createAuthClient } from "@/lib/supabase/server";

/**
 * The actual admin gate.
 *
 * Middleware also redirects anonymous visitors away from /admin, but that is
 * a convenience, not the boundary. Next.js has shipped middleware-bypass
 * advisories before (see the 16.3.6 upgrade note), so every admin page and
 * every mutating Server Action calls this directly. A gate that exists only
 * in middleware is a gate that can be walked around.
 *
 * Uses getUser(), which verifies the JWT with the auth server, rather than
 * getSession(), which only decodes whatever cookie the browser sent.
 */
export async function requireAdmin() {
  const supabase = await createAuthClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) redirect("/admin/login");
  return user;
}

/** Non-redirecting variant, for Server Actions that return an error shape. */
export async function getAdminOrNull() {
  try {
    const supabase = await createAuthClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ?? null;
  } catch {
    return null;
  }
}
