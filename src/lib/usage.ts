import "server-only";
import { query } from "@/lib/db/client";

/**
 * Usage analytics (capability 10): daily TOTALS only. Nothing that
 * identifies a visitor is stored or even received -- no cookies, no IP
 * addresses, no user IDs, no search text. The day is Baku's calendar day.
 */
export type UsageMetric = "tool_open" | "search_empty" | "assistant_question";

export async function bumpUsage(metric: UsageMetric, key: string, locale: string): Promise<void> {
  try {
    await query(
      `insert into usage_daily (day, metric, key, locale, count)
       values ((now() at time zone 'Asia/Baku')::date, $1, $2, $3, 1)
       on conflict (day, metric, key, locale) do update set count = usage_daily.count + 1`,
      [metric, key.slice(0, 64), locale.slice(0, 5)]
    );
  } catch (err) {
    console.error("[usage] not recorded:", err instanceof Error ? err.message : err);
  }
}
