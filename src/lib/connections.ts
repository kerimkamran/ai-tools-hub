import "server-only";
import { query, queryOne, type Tx } from "@/lib/db/client";
import { openSecret } from "@/lib/secret-box";
import { checkPublicHttpsUrl } from "@/lib/validate";
import { currentMonth } from "@/lib/ai-settings";
import { isAzureEndpointHost, providerById, type ProviderId, type PurposeId } from "@/lib/providers";

/**
 * API connections (capability 7). The rules:
 *  - The key is decrypted only in this module, per call, and never returned
 *    by anything a page can render. Pages get ConnectionView (last four only).
 *  - ANTHROPIC_API_KEY, when set, is "managed by environment" and takes
 *    precedence for every Anthropic connection.
 *  - A connection in use by a purpose cannot be deleted (also enforced by the
 *    foreign key, ON DELETE RESTRICT).
 */

export type ConnectionView = {
  id: number;
  provider: ProviderId;
  label: string;
  config: Record<string, string>;
  keyLast4: string | null;
  hasKey: boolean;
  keyReadable: boolean;
  envManaged: boolean;
  enabled: boolean;
  monthlyCapUsd: number | null;
  spendUsd: number;
  createdBy: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
  usedBy: PurposeId[];
};

type Row = {
  id: string;
  provider: ProviderId;
  label: string;
  config: Record<string, string> | null;
  key_encrypted: string | null;
  key_last4: string | null;
  enabled: boolean;
  monthly_cap_usd: string | null;
  spend_month: string;
  spend_usd: string;
  created_by: string | null;
  created_at: Date;
  last_used_at: Date | null;
  last_tested_at: Date | null;
  last_test_ok: boolean | null;
  last_test_message: string | null;
};

const COLS = `id::text, provider, label, config, key_encrypted, key_last4, enabled, monthly_cap_usd::text,
  spend_month, spend_usd::text, created_by, created_at, last_used_at, last_tested_at, last_test_ok, last_test_message`;

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);

export function envKeyFor(provider: ProviderId): string | null {
  return provider === "anthropic" && process.env.ANTHROPIC_API_KEY ? process.env.ANTHROPIC_API_KEY : null;
}

function toView(r: Row, usedBy: PurposeId[]): ConnectionView {
  const env = envKeyFor(r.provider);
  return {
    id: Number(r.id),
    provider: r.provider,
    label: r.label,
    config: r.config ?? {},
    keyLast4: env ? env.slice(-4) : r.key_last4,
    hasKey: Boolean(env || r.key_encrypted),
    keyReadable: Boolean(env || openSecret(r.key_encrypted)),
    envManaged: Boolean(env),
    enabled: r.enabled,
    monthlyCapUsd: r.monthly_cap_usd === null ? null : Number(r.monthly_cap_usd),
    spendUsd: r.spend_month === currentMonth() ? Number(r.spend_usd) : 0,
    createdBy: r.created_by,
    createdAt: iso(r.created_at)!,
    lastUsedAt: iso(r.last_used_at),
    lastTestedAt: iso(r.last_tested_at),
    lastTestOk: r.last_test_ok,
    lastTestMessage: r.last_test_message,
    usedBy,
  };
}

async function usage(): Promise<Map<number, PurposeId[]>> {
  const rows = await query<{ purpose: PurposeId; connection_id: string | null }>("select purpose, connection_id::text from ai_purposes");
  const m = new Map<number, PurposeId[]>();
  for (const r of rows) {
    if (!r.connection_id) continue;
    const id = Number(r.connection_id);
    m.set(id, [...(m.get(id) ?? []), r.purpose]);
  }
  return m;
}

export async function listConnections(): Promise<ConnectionView[]> {
  const [rows, used] = await Promise.all([query<Row>(`select ${COLS} from api_connections order by id`), usage()]);
  return rows.map((r) => toView(r, used.get(Number(r.id)) ?? []));
}

export async function getConnection(id: number): Promise<ConnectionView | null> {
  const r = await queryOne<Row>(`select ${COLS} from api_connections where id = $1`, [id]);
  if (!r) return null;
  return toView(r, (await usage()).get(id) ?? []);
}

/** Server-only: the plaintext key for a call. Never pass the result to a page. */
export async function connectionKey(id: number, tx?: Tx): Promise<string | null> {
  const q: Tx["queryOne"] = tx ? tx.queryOne : queryOne;
  const r = await q<{ provider: ProviderId; key_encrypted: string | null }>(
    "select provider, key_encrypted from api_connections where id = $1",
    [id]
  );
  if (!r) return null;
  return envKeyFor(r.provider) ?? openSecret(r.key_encrypted);
}

/**
 * Validates the provider's non-secret fields against its template. Returns
 * a clean config (only known fields, trimmed) or the first problem.
 */
export function validateConfig(provider: ProviderId, raw: Record<string, string>): { ok: true; config: Record<string, string> } | { ok: false; error: string } {
  const t = providerById(provider);
  if (!t) return { ok: false, error: "Unknown provider." };
  const config: Record<string, string> = {};
  for (const f of t.fields) {
    const v = (raw[f.key] ?? "").trim();
    if (!v) {
      if (f.required) return { ok: false, error: `${f.label} is required.` };
      continue;
    }
    if (v.length > f.max) return { ok: false, error: `${f.label} is too long.` };
    if (f.pattern && !new RegExp(f.pattern).test(v)) return { ok: false, error: `${f.label} is not in the expected format.` };
    config[f.key] = v;
  }
  // URL fields go through the same SSRF check as health URLs.
  if (provider === "custom") {
    const c = checkPublicHttpsUrl(config.baseUrl);
    if (!c.ok) return { ok: false, error: `Base URL refused: ${c.reason}` };
    if (c.url.search || c.url.hash) return { ok: false, error: "Base URL must not contain a query or fragment — keys never go in the URL." };
    config.baseUrl = c.url.toString().replace(/\/$/, "");
  }
  if (provider === "azure_openai") {
    const c = checkPublicHttpsUrl(config.endpoint);
    if (!c.ok) return { ok: false, error: `Endpoint refused: ${c.reason}` };
    if (!isAzureEndpointHost(c.url.hostname)) return { ok: false, error: "Endpoint must be an …openai.azure.com or …cognitiveservices.azure.com address." };
    config.endpoint = `${c.url.protocol}//${c.url.host}`;
  }
  return { ok: true, config };
}

export function validateKey(provider: ProviderId, key: string): string | null {
  const t = providerById(provider);
  if (!t) return "Unknown provider.";
  if (key.length > 400) return "That key is too long.";
  if (/\s/.test(key)) return "The key must not contain spaces.";
  if (t.keyPattern && !new RegExp(t.keyPattern).test(key)) return `That does not look like a ${t.name} key (${t.keyHint.toLowerCase()}).`;
  return null;
}

// ---- Purposes ---------------------------------------------------------------------

export type PurposeView = { purpose: PurposeId; connectionId: number | null; model: string };

export async function listPurposes(): Promise<PurposeView[]> {
  const rows = await query<{ purpose: PurposeId; connection_id: string | null; model: string }>(
    "select purpose, connection_id::text, model from ai_purposes"
  );
  return rows.map((r) => ({ purpose: r.purpose, connectionId: r.connection_id ? Number(r.connection_id) : null, model: r.model }));
}

export type Resolved =
  | { ok: true; connectionId: number; provider: ProviderId; model: string; apiKey: string }
  | { ok: false; code: "not_configured" | "budget" | "connection_cap" };

/**
 * What serves a purpose right now: an enabled connection whose provider has
 * an adapter, with a readable key, under its own cap. The global monthly
 * budget is checked by the caller (getAiSettings).
 */
export async function resolvePurpose(purpose: PurposeId): Promise<Resolved> {
  const r = await queryOne<Row & { model: string }>(
    `select ${COLS.split(",").map((c) => "c." + c.trim()).join(", ")}, p.model
       from ai_purposes p join api_connections c on c.id = p.connection_id
      where p.purpose = $1`,
    [purpose]
  );
  if (!r || !r.enabled || !providerById(r.provider)?.adapter) return { ok: false, code: "not_configured" };
  const apiKey = envKeyFor(r.provider) ?? openSecret(r.key_encrypted);
  if (!apiKey) return { ok: false, code: "not_configured" };
  const spend = r.spend_month === currentMonth() ? Number(r.spend_usd) : 0;
  if (r.monthly_cap_usd !== null && spend >= Number(r.monthly_cap_usd)) return { ok: false, code: "connection_cap" };
  return { ok: true, connectionId: Number(r.id), provider: r.provider, model: r.model, apiKey };
}

// ---- Spend & alerts ---------------------------------------------------------------

export const ALERT_THRESHOLDS = [50, 80, 100] as const;

/** Adds spend to the connection and records any alert threshold now crossed. */
export async function recordConnectionSpend(connectionId: number, amount: number): Promise<void> {
  const month = currentMonth();
  const row = await queryOne<{ spend_usd: string; monthly_cap_usd: string | null }>(
    `update api_connections set
       spend_usd = case when spend_month = $2 then spend_usd + $3 else $3 end,
       spend_month = $2, last_used_at = now()
     where id = $1 returning spend_usd::text, monthly_cap_usd::text`,
    [connectionId, month, amount]
  );
  if (row?.monthly_cap_usd) await fireAlerts(`connection:${connectionId}`, Number(row.spend_usd), Number(row.monthly_cap_usd));
}

export async function fireAlerts(scope: string, spend: number, limit: number): Promise<void> {
  if (!(limit > 0)) return;
  const month = currentMonth();
  for (const t of ALERT_THRESHOLDS) {
    if (spend >= (limit * t) / 100) {
      await query(
        `insert into ai_alerts (month, scope, threshold, spend_usd, limit_usd) values ($1, $2, $3, $4, $5)
         on conflict (month, scope, threshold) do nothing`,
        [month, scope, t, spend, limit]
      );
    }
  }
}

export type AlertView = { scope: string; threshold: number; spendUsd: number; limitUsd: number; firedAt: string };

/** This month's alerts, highest threshold per scope. */
export async function currentAlerts(): Promise<AlertView[]> {
  const rows = await query<{ scope: string; threshold: number; spend_usd: string; limit_usd: string; fired_at: Date }>(
    `select distinct on (scope) scope, threshold, spend_usd::text, limit_usd::text, fired_at
       from ai_alerts where month = $1 order by scope, threshold desc`,
    [currentMonth()]
  );
  return rows.map((r) => ({ scope: r.scope, threshold: r.threshold, spendUsd: Number(r.spend_usd), limitUsd: Number(r.limit_usd), firedAt: iso(r.fired_at)! }));
}
