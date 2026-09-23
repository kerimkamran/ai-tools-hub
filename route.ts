import { NextResponse } from "next/server";
import { getCatalogTools } from "@/lib/registry";
import { checkPublicHttpsUrl } from "@/lib/validate";
import type { ToolHealth } from "@/lib/types";

/**
 * Cached status probe.
 *
 * Security shape, deliberately narrow:
 *  - No URL is ever accepted from the request. The route fetches only the
 *    healthUrl values already stored in the registry, so this endpoint cannot
 *    be turned into a general-purpose fetcher or a port scanner.
 *  - Each URL is re-validated here even though it was validated on write.
 *  - redirect: "manual" -- a 302 to somewhere private is not followed.
 *  - The response body is never read and never returned. Callers get only
 *    {id: "up" | "slow"}: no status code, no headers, no content.
 *  - Results are cached, so repeated hits do not produce repeated outbound
 *    requests.
 *
 * Cache TTL is deliberately long (30 min, not 5).
 *
 * Measured: SparkLab's health endpoint answers in ~21s from cold, because
 * Render's free tier sleeps after roughly 15 minutes idle. A probe does not
 * just observe that -- it WAKES the instance, and our 3s timeout aborts long
 * before the answer arrives, so a short TTL would burn the tool's free
 * instance-hours to learn nothing. Thirty minutes keeps the badge useful for
 * tools that stay up, while making it impossible for this route to act as an
 * accidental keep-warm cron -- which was an explicit product decision.
 *
 * Known limit: hostname checks cannot stop a DNS name that resolves to a
 * private address. The controls above are what contain that residual risk.
 */
export const revalidate = 1800;

const TIMEOUT_MS = 3000;

async function probe(url: string): Promise<ToolHealth> {
  const check = checkPublicHttpsUrl(url);
  if (!check.ok) return "unknown";

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(check.url.toString(), {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { accept: "*/*" },
      cache: "no-store",
    });
    // Body is intentionally never read.
    if (!res.ok && res.status !== 0) return "unknown";
    return Date.now() - started > 1500 ? "slow" : "up";
  } catch {
    // A timeout on a free-tier host that sleeps when idle is the expected
    // case, not an error: report it as "waking up" rather than "down", since
    // the request would in fact succeed given enough time.
    return "slow";
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const tools = await getCatalogTools();
  const targets = tools.filter((t) => t.healthUrl && t.status === "published");

  const entries = await Promise.all(
    targets.map(async (t) => [t.id, await probe(t.healthUrl as string)] as const)
  );

  const result: Record<string, ToolHealth> = {};
  for (const [id, state] of entries) {
    if (state !== "unknown") result[id] = state;
  }

  return NextResponse.json(
    { tools: result },
    {
      headers: {
        "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
        "X-Robots-Tag": "noindex",
      },
    }
  );
}
