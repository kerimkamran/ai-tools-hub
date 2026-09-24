import { SESSION_COOKIE, getVerifiedSession } from "@/lib/session";
import { resolveRole } from "@/lib/roles";
import { can } from "@/lib/permissions";

/**
 * Tells the home page's Graham Bell panel (a client component, so the home
 * page itself can stay static/ISR and never touch cookies) whether the
 * visitor is signed in with assistant access. Never returns anything about
 * an ineligible session beyond "not signed in" -- same discipline as
 * /api/assistant and /api/assistant/rate.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const token = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);

  const session = token ? await getVerifiedSession(decodeURIComponent(token)) : null;
  if (!session) {
    return Response.json({ signedIn: false }, { headers: { "Cache-Control": "no-store" } });
  }
  const ok = can(await resolveRole(session.email), "assistant.use");
  return Response.json(
    ok ? { signedIn: true, email: session.email } : { signedIn: false },
    { headers: { "Cache-Control": "no-store" } }
  );
}
