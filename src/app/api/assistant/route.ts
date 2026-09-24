import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { query, queryOne } from "@/lib/db/client";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { canUseAssistant } from "@/lib/auth";
import { costUsd, getAiSettings, modelInfo, recordSpend, resolveApiKey } from "@/lib/ai-settings";
import { getCatalogTools } from "@/lib/registry";
import { getPublishedArticles } from "@/lib/kb";
import { buildContext, INSTRUCTIONS, wrapQuestion } from "@/lib/assistant-prompt";
import { LOCALES } from "@/lib/i18n";
import { MAX_QUESTION_CHARS } from "@/lib/assistant-limits";

/**
 * The assistant endpoint (Phase D). Server-only: the browser posts here and
 * never talks to the model provider, so the key never leaves this process.
 *
 * Every request passes, in order: session -> access -> input validation ->
 * enabled/configured -> monthly budget -> per-user hourly rate limit. Only
 * then is the model called. Nothing about the conversation is stored beyond
 * token counts and cost -- no question or answer text is persisted.
 *
 * Response: newline-delimited JSON events --
 *   {"t":"text","v":"..."}  a chunk of the answer
 *   {"t":"done"}            finished normally
 *   {"t":"error","code":"..."}  failed mid-answer
 * Errors BEFORE the model is called are ordinary JSON with an HTTP status.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_ANSWER_CHARS = 6000;
const MAX_TURNS = 12;
const MAX_OUTPUT_TOKENS = 2048;

const bodySchema = z.object({
  locale: z.enum(LOCALES),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1),
      })
    )
    .min(1)
    .max(40),
});

function fail(status: number, code: string) {
  return Response.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  // --- who is asking --------------------------------------------------------
  const cookieHeader = request.headers.get("cookie") ?? "";
  const token = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  if (!process.env.AUTH_SECRET || !process.env.DATABASE_URL) return fail(503, "not_configured");
  const session = token ? await verifySessionToken(decodeURIComponent(token)) : null;
  if (!session) return fail(401, "unauthorized");
  if (!(await canUseAssistant(session.email))) return fail(403, "forbidden");
  const email = session.email.toLowerCase();

  // --- what they asked ------------------------------------------------------
  let body: z.infer<typeof bodySchema>;
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return fail(400, "bad_request");
    body = parsed.data;
  } catch {
    return fail(400, "bad_request");
  }
  const turns = body.messages.slice(-MAX_TURNS);
  // The conversation must end with the user's new question, and must start
  // with a user turn (the API requires it).
  while (turns.length && turns[0].role !== "user") turns.shift();
  const last = turns[turns.length - 1];
  if (!last || last.role !== "user") return fail(400, "bad_request");
  if (turns.some((m) => m.role === "user" && m.content.length > MAX_QUESTION_CHARS)) {
    return fail(400, "too_long");
  }

  // --- is it switched on, and can we afford it ------------------------------
  const settings = await getAiSettings();
  const apiKey = await resolveApiKey();
  if (!settings.enabled || !apiKey) return fail(503, "not_configured");
  if (settings.spendUsd >= settings.monthlyBudgetUsd) return fail(429, "budget");

  const recent = await queryOne<{ n: string }>(
    "select count(*)::text as n from assistant_requests where email = $1 and created_at > now() - interval '1 hour'",
    [email]
  );
  if (Number(recent?.n ?? 0) >= settings.hourlyLimit) return fail(429, "rate_limited");

  const started = await queryOne<{ id: string }>(
    "insert into assistant_requests (email, model) values ($1, $2) returning id::text",
    [email, settings.model]
  );
  const requestId = started?.id;

  // --- build the prompt -----------------------------------------------------
  const [tools, articles] = await Promise.all([getCatalogTools(), getPublishedArticles()]);
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: INSTRUCTIONS },
    { type: "text", text: buildContext(tools, articles), cache_control: { type: "ephemeral" } },
  ];
  const messages: Anthropic.MessageParam[] = turns.map((m) => ({
    role: m.role,
    content:
      m.role === "user"
        ? wrapQuestion(m.content, body.locale)
        : m.content.slice(0, MAX_ANSWER_CHARS),
  }));

  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 60_000 });
  const model = settings.model;
  const encoder = new TextEncoder();
  const line = (obj: unknown) => encoder.encode(`${JSON.stringify(obj)}\n`);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let status: "ok" | "error" = "ok";
      let usage: Anthropic.Usage | null = null;
      try {
        const s = client.messages.stream(
          {
            model,
            max_tokens: MAX_OUTPUT_TOKENS,
            system,
            messages,
            ...(modelInfo(model).effort ? { output_config: { effort: "low" as const } } : {}),
          },
          { signal: request.signal }
        );
        s.on("text", (delta) => controller.enqueue(line({ t: "text", v: delta })));
        const final = await s.finalMessage();
        usage = final.usage;
        controller.enqueue(line({ t: "done" }));
      } catch (err) {
        status = "error";
        // Never forward the provider's error text: it can echo request
        // details. Log a short, key-free summary server-side instead.
        const name = err instanceof Error ? err.name : "Error";
        const statusCode = (err as { status?: number })?.status;
        console.error(`[assistant] model call failed: ${name}${statusCode ? ` (${statusCode})` : ""}`);
        try {
          controller.enqueue(line({ t: "error", code: "upstream" }));
        } catch {
          // client already gone
        }
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
        const cost = usage ? costUsd(model, usage) : 0;
        try {
          if (requestId) {
            await query(
              `update assistant_requests set status = $2, input_tokens = $3, output_tokens = $4,
                 cache_read_tokens = $5, cache_write_tokens = $6, cost_usd = $7
               where id = $1`,
              [
                requestId,
                status,
                usage?.input_tokens ?? null,
                usage?.output_tokens ?? null,
                usage?.cache_read_input_tokens ?? null,
                usage?.cache_creation_input_tokens ?? null,
                cost,
              ]
            );
          }
          if (cost > 0) await recordSpend(cost);
        } catch (e) {
          console.error("[assistant] failed to record usage:", e instanceof Error ? e.message : e);
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
