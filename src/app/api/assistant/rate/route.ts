import { z } from "zod";
import { query } from "@/lib/db/client";
import { SESSION_COOKIE, getVerifiedSession } from "@/lib/session";
import { resolveRole } from "@/lib/roles";
import { can } from "@/lib/permissions";

/**
 * Thumbs up/down on an answer (capability 8). The asker proves the answer
 * was theirs by holding its random token AND being signed in as the email
 * that asked. The transcript (if text storage is on) is found by its own,
 * separate token, so the database never links it to the person.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const body = z.object({
  r: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  tt: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/).optional(),
  rating: z.union([z.literal(1), z.literal(-1)]),
});

export async function POST(request: Request) {
  const token = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  const session = token ? await getVerifiedSession(decodeURIComponent(token)) : null;
  if (!session || !can(await resolveRole(session.email), "assistant.use")) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const { r, tt, rating } = parsed.data;

  const rows = await query(
    "update assistant_requests set rating = $3 where rate_token = $1 and email = $2 and created_at > now() - interval '7 days' returning id",
    [r, session.email.toLowerCase(), rating]
  );
  if (rows.length === 0) return Response.json({ error: "not_found" }, { status: 404 });
  if (tt) {
    await query("update assistant_transcripts set rating = $2 where rate_token = $1", [tt, rating]);
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
