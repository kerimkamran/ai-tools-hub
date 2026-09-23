import type { NextRequest } from "next/server";
import { updateAdminSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateAdminSession(request);
}

/**
 * ⚠ THE MOST IMPORTANT LINE IN THIS REPOSITORY.
 *
 * The matcher covers /admin and nothing else, on purpose.
 *
 * Vantage's equivalent matcher spans essentially every route, because every
 * route there is authenticated. Copying that habit here would put a Supabase
 * session round-trip in front of the public catalog, opting it into dynamic
 * rendering and destroying the static, cookie-free delivery that is the whole
 * point of this page. The public catalog must never touch a cookie.
 *
 * If you are about to widen this, don't. Add the check inside the route
 * instead.
 */
export const config = {
  matcher: ["/admin/:path*"],
};
