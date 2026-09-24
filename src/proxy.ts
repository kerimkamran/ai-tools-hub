import { NextResponse, type NextRequest } from "next/server";
import {
  getVerifiedSession,
  refreshSessionToken,
  sessionCookieOptions,
  SESSION_COOKIE,
} from "@/lib/session";
import { isAdminRole } from "@/lib/permissions";
import { mfaRequiredFor, resolveRole } from "@/lib/roles";

/**
 * Keeps non-admins off /admin and slides the session cookie -- a
 * convenience, NOT the security boundary. Every admin page and Server
 * Action re-checks with requirePermission() (src/lib/auth.ts); Next.js has
 * shipped proxy-bypass advisories before, so a gate that lives only here is
 * one that can be walked around.
 *
 * Uses the same single verifier as everything else, so a revoked, expired,
 * disabled or version-bumped session is rejected here too, and a cookie is
 * only ever re-issued after it has passed that check (a revoked cookie is
 * never revived).
 *
 * Runs on the Node.js runtime (the default for proxy.ts in this Next.js
 * version), which is what lets it query Postgres directly.
 */

const OPEN_PATHS = ["/admin/login", "/admin/login/mfa"];

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isOpen = OPEN_PATHS.includes(path) || path.startsWith("/admin/invite/");

  const redirectTo = (pathname: string) => {
    const to = request.nextUrl.clone();
    to.pathname = pathname;
    to.search = "";
    return NextResponse.redirect(to);
  };

  if (!process.env.AUTH_SECRET || !process.env.DATABASE_URL) {
    // Fail CLOSED. An unconfigured deployment must not leave /admin open.
    return isOpen ? NextResponse.next() : redirectTo("/admin/login");
  }

  const session = await getVerifiedSession(request.cookies.get(SESSION_COOKIE)?.value);
  const role = session ? await resolveRole(session.email) : null;
  const admin = Boolean(session && isAdminRole(role));

  if (isOpen) {
    // Only a real admin is forwarded off the sign-in page. A signed-in
    // non-admin stays there and is told so, rather than ping-ponging.
    if (admin && path === "/admin/login") return redirectTo("/admin");
    return NextResponse.next();
  }
  if (!session || !admin) return redirectTo("/admin/login");

  if (
    mfaRequiredFor(role, session.policy.mfaRequiredAdmins) &&
    !session.mfa &&
    path !== "/admin/security/mfa"
  ) {
    return redirectTo("/admin/security/mfa");
  }

  const response = NextResponse.next();
  if (session.refreshDue) {
    response.cookies.set(
      SESSION_COOKIE,
      await refreshSessionToken(session),
      sessionCookieOptions(session.policy, session.at)
    );
  }
  return response;
}

/**
 * ⚠ THE MOST IMPORTANT LINE IN THIS REPOSITORY.
 *
 * The matcher covers /admin and nothing else, on purpose. Widening it would
 * put a session/database round-trip in front of the public catalog, opting
 * it into dynamic rendering and destroying its static, cookie-free delivery.
 * The assistant does its own check (and /api/assistant slides its own cookie).
 */
export const config = {
  matcher: ["/admin/:path*"],
};
