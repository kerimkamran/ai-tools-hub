import { NextResponse } from "next/server";
import { getCatalogTools } from "@/lib/registry";
import { hasDatabaseConfig } from "@/lib/db/client";
import { probeUrl, recordHealth, type HealthOutcome } from "@/lib/health";
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

/** Public view of a probe: timeouts on a sleeping free-tier host read as
 *  "slow" (waking up), never as "down". */
function publicState(outcome: HealthOutcome | undefined): ToolHealth {
  if (outcome === "up") return "up";
  if (outcome === "slow" || outcome === "timeout") return "slow";
  return "unknown";
}

export async function GET() {
  const tools = await getCatalogTools();
  // Tools in maintenance are not probed: the badge says why, and a probe would only wake them.
  const targets = tools.filter((t) => t.healthUrl && t.status === "published" && !t.maintenance);

  const entries = await Promise.all(
    targets.map(async (t) => [t.id, await probeUrl(t.healthUrl as string)] as const)
  );

  const result: Record<string, ToolHealth> = {};
  for (const [id, r] of entries) {
    // Every real probe leaves a row, so the admin catalog shows history.
    if (r && hasDatabaseConfig()) {
      await recordHealth(id, r.outcome, r.durationMs, "probe").catch(() => {});
    }
    const state = publicState(r?.outcome);
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
