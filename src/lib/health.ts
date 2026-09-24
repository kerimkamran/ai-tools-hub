import "server-only";
import { query } from "@/lib/db/client";
import { checkPublicHttpsUrl } from "@/lib/validate";

/**
 * Tool health (Admin Panel Plan, capability 5). One probe = one row in
 * tool_health, so the panel shows what actually happened rather than a
 * guess. The probe rules are the same narrow ones /api/health always had:
 * only stored URLs, re-validated, redirects not followed, body never read.
 *
 * A timeout is recorded as "timeout" and shown as "timed out (possibly
 * waking)": a free-tier host that sleeps cannot be told apart from one that
 * is down, and a probe that waits longer would only burn its instance hours.
 */

export type HealthOutcome = "up" | "slow" | "timeout" | "error";
export type HealthTrigger = "probe" | "manual";

export const HEALTH_LABEL: Record<HealthOutcome, string> = {
  up: "Up",
  slow: "Slow",
  timeout: "Timed out (possibly waking)",
  error: "Error",
};

const TIMEOUT_MS = 3000;
const SLOW_MS = 1500;
/** "Check now" may run at most once per tool in this window. */
export const MANUAL_COOLDOWN_MINUTES = 30;

export async function probeUrl(url: string): Promise<{ outcome: HealthOutcome; durationMs: number } | null> {
  const check = checkPublicHttpsUrl(url);
  if (!check.ok) return null;
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
    const durationMs = Date.now() - started;
    // Body is intentionally never read.
    if (!res.ok && res.status !== 0 && !(res.status >= 300 && res.status < 400)) {
      return { outcome: "error", durationMs };
    }
    return { outcome: durationMs > SLOW_MS ? "slow" : "up", durationMs };
  } catch {
    const durationMs = Date.now() - started;
    return { outcome: controller.signal.aborted ? "timeout" : "error", durationMs };
  } finally {
    clearTimeout(timer);
  }
}

export async function recordHealth(toolId: string, outcome: HealthOutcome, durationMs: number, trigger: HealthTrigger) {
  await query(
    "insert into tool_health (tool_id, outcome, duration_ms, trigger) values ($1, $2, $3, $4)",
    [toolId, outcome, durationMs, trigger]
  );
}

export type LatestHealth = { outcome: HealthOutcome; checkedAt: string; durationMs: number | null; trigger: HealthTrigger };

/** Latest probe per tool. */
export async function latestHealthByTool(): Promise<Map<string, LatestHealth>> {
  const rows = await query<{ tool_id: string; outcome: HealthOutcome; checked_at: Date; duration_ms: number | null; trigger: HealthTrigger }>(
    `select distinct on (tool_id) tool_id, outcome, checked_at, duration_ms, trigger
       from tool_health order by tool_id, checked_at desc`
  );
  return new Map(
    rows.map((r) => [
      r.tool_id,
      { outcome: r.outcome, checkedAt: new Date(r.checked_at).toISOString(), durationMs: r.duration_ms, trigger: r.trigger },
    ])
  );
}

/** Minutes left before "Check now" may run again for this tool (0 = allowed). */
export async function manualCooldownLeft(toolId: string): Promise<number> {
  const rows = await query<{ at: Date }>(
    "select max(checked_at) as at from tool_health where tool_id = $1 and trigger = 'manual'",
    [toolId]
  );
  const at = rows[0]?.at;
  if (!at) return 0;
  const elapsed = (Date.now() - new Date(at).getTime()) / 60000;
  return Math.max(0, Math.ceil(MANUAL_COOLDOWN_MINUTES - elapsed));
}

/** Keep health history short: 30 days. */
export async function pruneHealth() {
  await query("delete from tool_health where checked_at < now() - interval '30 days'");
}
