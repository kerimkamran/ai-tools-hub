import "server-only";
import { query, queryOne } from "@/lib/db/client";
import { openSecret } from "@/lib/secret-box";

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
  model: ModelId;
  enabled: boolean;
  monthlyBudgetUsd: number;
  hourlyLimit: number;
  /** Spend in the CURRENT month (a stored figure from an earlier month reads as 0). */
  spendUsd: number;
  hasStoredKey: boolean;
  storedKeyReadable: boolean;
  keyLast4: string | null;
  /** ANTHROPIC_API_KEY is set and therefore takes precedence over the stored key. */
  envKey: boolean;
};

type Row = {
  model: string;
  enabled: boolean;
  monthly_budget_usd: string;
  hourly_limit: number;
  spend_month: string;
  spend_usd: string;
  api_key_encrypted: string | null;
  api_key_last4: string | null;
};

async function loadRow(): Promise<Row | null> {
  return queryOne<Row>(
    `select model, enabled, monthly_budget_usd::text, hourly_limit, spend_month,
            spend_usd::text, api_key_encrypted, api_key_last4
       from ai_settings where id = 1`
  );
}

export async function getAiSettings(): Promise<AiSettings> {
  const row = await loadRow();
  const envKey = Boolean(process.env.ANTHROPIC_API_KEY);
  if (!row) {
    return {
      model: DEFAULT_MODEL, enabled: false, monthlyBudgetUsd: 20, hourlyLimit: 20,
      spendUsd: 0, hasStoredKey: false, storedKeyReadable: false, keyLast4: null, envKey,
    };
  }
  return {
    model: modelInfo(row.model).id,
    enabled: row.enabled,
    monthlyBudgetUsd: Number(row.monthly_budget_usd),
    hourlyLimit: row.hourly_limit,
    spendUsd: row.spend_month === currentMonth() ? Number(row.spend_usd) : 0,
    hasStoredKey: Boolean(row.api_key_encrypted),
    storedKeyReadable: Boolean(openSecret(row.api_key_encrypted)),
    keyLast4: row.api_key_last4,
    envKey,
  };
}

/**
 * The key to call the API with. ANTHROPIC_API_KEY wins when set -- for
 * anyone who would rather not store a key in the database at all. Decrypted
 * only here, in server code, per request; never returned to a client, never
 * logged, never included in an error message.
 */
export async function resolveApiKey(): Promise<string | null> {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const row = await loadRow();
  return openSecret(row?.api_key_encrypted ?? null);
}

/** Adds to this month's spend, starting a fresh month when it has rolled over. */
export async function recordSpend(amount: number): Promise<void> {
  const month = currentMonth();
  await query(
    `update ai_settings set
       spend_usd = case when spend_month = $1 then spend_usd + $2 else $2 end,
       spend_month = $1
     where id = 1`,
    [month, amount]
  );
}
