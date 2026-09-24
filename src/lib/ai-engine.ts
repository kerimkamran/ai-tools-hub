import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { query, queryOne } from "@/lib/db/client";
import { costUsd, getAiSettings, modelInfo, recordSpend } from "@/lib/ai-settings";
import { recordConnectionSpend, resolvePurpose } from "@/lib/connections";

/**
 * The shared, non-streaming model call for everything that is not the
 * staff chat itself: translation drafts and the knowledge base test console.
 * Same rules as /api/assistant: the key is decrypted here per call and never
 * leaves the server; the monthly budget is checked first; every call leaves
 * a usage row (no text is stored) and adds to the month's spend.
 */

export type EnginePurpose = "translation" | "kb_console";

export type EngineResult =
  | { ok: true; text: string; costUsd: number }
  | { ok: false; code: "not_configured" | "budget" | "upstream"; message: string };

const MESSAGES: Record<"not_configured" | "budget" | "upstream", string> = {
  not_configured: "No working AI connection for this purpose, or the assistant is switched off (AI → Connections).",
  budget: "This month's AI budget is used up.",
  upstream: "The AI provider did not answer. Try again in a minute.",
};

export async function completeText(opts: {
  email: string;
  purpose: EnginePurpose;
  system: Anthropic.TextBlockParam[] | string;
  user: string;
  maxTokens: number;
}): Promise<EngineResult> {
  const settings = await getAiSettings();
  if (!settings.enabled) return { ok: false, code: "not_configured", message: MESSAGES.not_configured };
  // The test console answers like the assistant, so it uses that purpose.
  const serving = await resolvePurpose(opts.purpose === "translation" ? "translation" : "assistant");
  if (!serving.ok) {
    return serving.code === "connection_cap"
      ? { ok: false, code: "budget", message: "This connection's monthly cap is used up." }
      : { ok: false, code: "not_configured", message: MESSAGES.not_configured };
  }
  if (settings.spendUsd >= settings.monthlyBudgetUsd) return { ok: false, code: "budget", message: MESSAGES.budget };
  const apiKey = serving.apiKey;
  const model = serving.model;

  const started = await queryOne<{ id: string }>(
    "insert into assistant_requests (email, model, purpose, connection_id) values ($1, $2, $3, $4) returning id::text",
    [opts.email.toLowerCase(), model, opts.purpose, serving.connectionId]
  );
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 90_000 });
  let usage: Anthropic.Usage | null = null;
  let status: "ok" | "error" = "ok";
  try {
    const msg = await client.messages.create({
      model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
      ...(modelInfo(model).effort ? { output_config: { effort: "low" as const } } : {}),
    });
    usage = msg.usage;
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return { ok: true, text, costUsd: costUsd(model, usage) };
  } catch (err) {
    status = "error";
    const name = err instanceof Error ? err.name : "Error";
    const code = (err as { status?: number })?.status;
    console.error(`[ai-engine] ${opts.purpose} call failed: ${name}${code ? ` (${code})` : ""}`);
    return { ok: false, code: "upstream", message: MESSAGES.upstream };
  } finally {
    const cost = usage ? costUsd(model, usage) : 0;
    try {
      if (started?.id) {
        await query(
          `update assistant_requests set status = $2, input_tokens = $3, output_tokens = $4,
             cache_read_tokens = $5, cache_write_tokens = $6, cost_usd = $7 where id = $1`,
          [started.id, status, usage?.input_tokens ?? null, usage?.output_tokens ?? null,
           usage?.cache_read_input_tokens ?? null, usage?.cache_creation_input_tokens ?? null, cost]
        );
      }
      if (cost > 0) {
        await recordSpend(cost);
        await recordConnectionSpend(serving.connectionId, cost);
      }
    } catch (e) {
      console.error("[ai-engine] failed to record usage:", e instanceof Error ? e.message : e);
    }
  }
}

/** Pulls the first JSON object out of a model reply (tolerates ``` fences). */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}
