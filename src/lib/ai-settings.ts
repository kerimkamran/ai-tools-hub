import "server-only";
import { query, queryOne } from "@/lib/db/client";

/**
 * AI provider settings (Phase D). One row, super-admin editable.
 *
 * Prices are USD per million tokens, from Anthropic's published pricing
 * (platform.claude.com/docs/en/about-claude/pricing, checked September 2026).
 * They drive the monthly budget kill switch, so if Anthropic changes them,
 * update this table -- spend is computed from the API's own usage figures
 * multiplied by these numbers.
 */
export const MODELS = [
  {
    id: "claude-opus-5-5",
    label: "Claude Opus 5.5 — most capable",
    price: { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
    effort: true,
  },
  {
    id: "claude-sonnet-5",
    label: "Claude Sonnet 5 — balanced",
    price: { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
    effort: true,
  },
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5 — fastest, cheapest",
    price: { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
    effort: false,
  },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];
export const DEFAULT_MODEL: ModelId = "claude-opus-5-5";

export function modelInfo(id: string) {
  return MODELS.find((m) => m.id === id) ?? MODELS[0];
}

export type Usage = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

export function costUsd(model: string, u: Usage): number {
  const p = modelInfo(model).price;
  return (
    ((u.input_tokens ?? 0) * p.input +
      (u.output_tokens ?? 0) * p.output +
      (u.cache_creation_input_tokens ?? 0) * p.cacheWrite +
      (u.cache_read_input_tokens ?? 0) * p.cacheRead) /
    1_000_000
  );
}

export function currentMonth(now = new Date()): string {
  return now.toISOString().slice(0, 7); // "YYYY-MM", UTC
}

export type AiSettings = {
  /** Model of the ASSISTANT purpose (kept for callers that show it). */
  model: ModelId;
  enabled: boolean;
  monthlyBudgetUsd: number;
  hourlyLimit: number;
  dailyLimit: number;
  storeTranscripts: boolean;
  autoTranslate: boolean;
  /** Spend in the CURRENT month (a stored figure from an earlier month reads as 0). */
  spendUsd: number;
};

type Row = {
  model: string;
  enabled: boolean;
  monthly_budget_usd: string;
  hourly_limit: number;
  daily_limit: number;
  store_transcripts: boolean;
  auto_translate: boolean;
  spend_month: string;
  spend_usd: string;
};

/**
 * The global switch, budget and limits. Keys and models per purpose live in
 * api_connections / ai_purposes since Phase 3 (src/lib/connections.ts).
 */
export async function getAiSettings(): Promise<AiSettings> {
  const row = await queryOne<Row>(
    `select coalesce((select model from ai_purposes where purpose = 'assistant'), s.model) as model,
            s.enabled, s.monthly_budget_usd::text, s.hourly_limit, s.daily_limit, s.store_transcripts, s.auto_translate,
            s.spend_month, s.spend_usd::text
       from ai_settings s where s.id = 1`
  );
  if (!row) {
    return { model: DEFAULT_MODEL, enabled: false, monthlyBudgetUsd: 20, hourlyLimit: 20, dailyLimit: 60, storeTranscripts: false, autoTranslate: true, spendUsd: 0 };
  }
  return {
    model: modelInfo(row.model).id,
    enabled: row.enabled,
    monthlyBudgetUsd: Number(row.monthly_budget_usd),
    hourlyLimit: row.hourly_limit,
    dailyLimit: row.daily_limit,
    storeTranscripts: row.store_transcripts,
    autoTranslate: row.auto_translate,
    spendUsd: row.spend_month === currentMonth() ? Number(row.spend_usd) : 0,
  };
}

/**
 * Adds to this month's spend (starting a fresh month when it has rolled
 * over) and fires the 50/80/100% budget alerts once each.
 */
export async function recordSpend(amount: number): Promise<void> {
  const month = currentMonth();
  const row = await queryOne<{ spend_usd: string; monthly_budget_usd: string }>(
    `update ai_settings set
       spend_usd = case when spend_month = $1 then spend_usd + $2 else $2 end,
       spend_month = $1
     where id = 1 returning spend_usd::text, monthly_budget_usd::text`,
    [month, amount]
  );
  if (!row) return;
  const spend = Number(row.spend_usd);
  const limit = Number(row.monthly_budget_usd);
  if (!(limit > 0)) return;
  for (const t of [50, 80, 100]) {
    if (spend >= (limit * t) / 100) {
      await query(
        `insert into ai_alerts (month, scope, threshold, spend_usd, limit_usd) values ($1, 'budget', $2, $3, $4)
         on conflict (month, scope, threshold) do nothing`,
        [month, t, spend, limit]
      );
    }
  }
}
