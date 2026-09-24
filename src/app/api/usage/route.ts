import { z } from "zod";
import { queryOne } from "@/lib/db/client";
import { bumpUsage } from "@/lib/usage";
import { LOCALES } from "@/lib/i18n";

/**
 * Beacon endpoint for tool opens and empty searches (capability 10).
 * Accepts only a fixed event shape, sets no cookie, stores only a daily
 * count. A per-process, in-memory limit (never stored, never logged) keeps
 * one client from inflating the numbers.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const body = z.discriminatedUnion("e", [
  z.object({ e: z.literal("open"), t: z.string().regex(/^[a-z0-9-]{1,64}$/), l: z.enum(LOCALES) }),
  z.object({ e: z.literal("empty"), l: z.enum(LOCALES) }),
]);

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const seen = new Map<string, { n: number; since: number }>();

function allowed(ip: string): boolean {
  const now = Date.now();
  if (seen.size > 5000) for (const [k, v] of seen) if (now - v.since > WINDOW_MS) seen.delete(k);
  const e = seen.get(ip);
  if (!e || now - e.since > WINDOW_MS) {
    seen.set(ip, { n: 1, since: now });
    return true;
  }
  e.n++;
  return e.n <= MAX_PER_WINDOW;
}

const ok = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  if (!allowed(ip)) return ok();
  let parsed;
  try {
    parsed = body.safeParse(JSON.parse(await request.text()));
  } catch {
    return ok();
  }
  if (!parsed.success) return ok();
  const ev = parsed.data;
  if (ev.e === "open") {
    const exists = await queryOne("select 1 as x from tools where id = $1 and status in ('published', 'unlisted')", [ev.t]).catch(() => null);
    if (exists) await bumpUsage("tool_open", ev.t, ev.l);
  } else {
    await bumpUsage("search_empty", "", ev.l);
  }
  return ok();
}
