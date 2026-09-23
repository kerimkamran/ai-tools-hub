import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session cookie and keeps non-admins off /admin.
 *
 * Runs ONLY for /admin/* (see src/proxy.ts) and is a convenience, not the
 * security boundary -- every admin page and Server Action re-checks the user
 * itself via requireAdmin(). Next.js has shipped proxy/middleware-bypass
 * advisories before, so a gate that lives only here is one that can be walked
 * around.
 *
 * The allowlist check is duplicated from src/lib/auth.ts on purpose. Without
 * it this function would bounce a signed-in NON-admin from /admin/login to
 * /admin, requireAdmin() would bounce them straight back, and the browser
 * would spin in a redirect loop instead of telling them they lack access.
 */
function isAllowlisted(email: string | undefined): boolean {
  if (!email) return false;
  const allowed = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return false; // empty allowlist authorizes nobody
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

  const admin = isAllowlisted(user?.email);

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
