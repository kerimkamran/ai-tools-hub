import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";
import { queryOne } from "@/lib/db/client";

/**
 * Refreshes nothing (there is no refresh token model here, unlike Supabase's
 * cookie pair) but keeps non-admins off /admin -- a convenience redirect,
 * not the security boundary. Every admin page and Server Action re-checks
 * the user itself via requireAdmin()/requireSuperAdmin() in src/lib/auth.ts.
 * Next.js has shipped proxy/middleware-bypass advisories before, so a gate
 * that lives only here is one that can be walked around.
 *
 * The allowlist check is duplicated from src/lib/auth.ts on purpose. Without
 * it this function would bounce a signed-in NON-admin from /admin/login to
 * /admin, requireAdmin() would bounce them straight back, and the browser
 * would spin in a redirect loop instead of telling them they lack access.
 *
 * Proxy defaults to the Node.js runtime in this Next.js version (see
 * AGENTS.md -- this is a breaking change from older Next.js, where
 * Middleware ran on the Edge runtime and could not open a raw TCP
 * connection to Postgres at all). That's what makes it safe to query
 * admin_users directly here for the invited-admin convenience check, the
 * same way the Supabase version called its is_admin_email() RPC from the
 * edge -- no RPC indirection is needed now, just a real query.
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

async function isInvitedAdminAllowlisted(email: string): Promise<boolean> {
  try {
    const row = await queryOne<{ email: string }>(
      "select email from admin_users where email = $1",
      [email.toLowerCase()]
    );
    return Boolean(row);
  } catch {
    // Convenience check only -- a failure here is treated as "not an
    // admin", never as "an admin"; the real decision is requireAdmin()'s
    // authoritative lookup once the request reaches the actual page or
    // Server Action.
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  const path = request.nextUrl.pathname;
  const isLogin = path === "/admin/login";
  const isInviteAccept = path.startsWith("/admin/invite/");

  const toLogin = () => {
    const to = request.nextUrl.clone();
    to.pathname = "/admin/login";
    to.search = "";
    return NextResponse.redirect(to);
  };

  if (!process.env.AUTH_SECRET || !process.env.DATABASE_URL) {
    // Fail CLOSED. An unconfigured deployment must not leave /admin open.
    // The invite-accept page is a rare exception: it authenticates via its
    // own one-time token, not a session cookie, so it is not gated here.
    return isLogin || isInviteAccept ? response : toLogin();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;
  const email = session?.email;

  let admin = isSuperAdminAllowlisted(email);
  if (!admin && email) {
    admin = await isInvitedAdminAllowlisted(email);
  }

  if (isInviteAccept) return response;
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

/**
 * ⚠ THE MOST IMPORTANT LINE IN THIS REPOSITORY.
 *
 * The matcher covers /admin and nothing else, on purpose.
 *
 * Copying the habit of matching every route would put a session/database
 * round-trip in front of the public catalog, opting it into dynamic
 * rendering and destroying the static, cookie-free delivery that is the
 * whole point of this page. The public catalog must never touch a cookie.
 *
 * If you are about to widen this, don't. Add the check inside the route
 * instead.
 */
export const config = {
  matcher: ["/admin/:path*"],
};
