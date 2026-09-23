import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session cookie and keeps non-admins off /admin.
 *
 * Runs ONLY for /admin/* (see src/proxy.ts) and is a convenience, not the
 * security boundary -- every admin page and Server Action re-checks the user
 * itself via requireAdmin()/requireSuperAdmin() in src/lib/auth.ts. Next.js
 * has shipped proxy/middleware-bypass advisories before, so a gate that
 * lives only here is one that can be walked around.
 *
 * The allowlist check is duplicated from src/lib/auth.ts on purpose. Without
 * it this function would bounce a signed-in NON-admin from /admin/login to
 * /admin, requireAdmin() would bounce them straight back, and the browser
 * would spin in a redirect loop instead of telling them they lack access.
 *
 * Phase B adds invited admins (the admin_users table) on top of the
 * SUPER_ADMIN_EMAILS bootstrap. Middleware runs at the edge with only the
 * anon key -- no service-role access -- so it cannot read admin_users
 * directly (RLS blocks it, deliberately: see 0003_admin_users.sql). Instead
 * it calls is_admin_email(), a SECURITY DEFINER function that returns a
 * single boolean and nothing else. If that call fails for any reason
 * (network, RPC not yet migrated, etc.) this falls back to the super-admin
 * check alone rather than failing open.
 */
function isSuperAdminAllowlisted(email: string | undefined): boolean {
  if (!email) return false;
  const allowed = (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return false;
  return allowed.includes(email.toLowerCase());
}

export async function updateAdminSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const path = request.nextUrl.pathname;
  const isLogin = path === "/admin/login";

  const toLogin = () => {
    const to = request.nextUrl.clone();
    to.pathname = "/admin/login";
    to.search = "";
    return NextResponse.redirect(to);
  };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    // Fail CLOSED. An unconfigured deployment must not leave /admin open.
    return isLogin ? response : toLogin();
  }

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let admin = isSuperAdminAllowlisted(user?.email);

  if (!admin && user?.email) {
    // Convenience check only -- see the function comment above. A failure
    // here is treated as "not an admin", never as "an admin"; the real
    // decision is requireAdmin()'s service-role lookup once the request
    // reaches the actual page or Server Action.
    const { data, error } = await supabase.rpc("is_admin_email", {
      check_email: user.email,
    });
    if (!error && data === true) admin = true;
  }

  if (!admin && !isLogin) return toLogin();

  // Only a real admin is forwarded off the login page. A signed-in non-admin
  // stays here and is told so, rather than ping-ponging with requireAdmin().
  if (admin && isLogin) {
    const to = request.nextUrl.clone();
    to.pathname = "/admin";
    to.search = "";
    return NextResponse.redirect(to);
  }

  return response;
}
