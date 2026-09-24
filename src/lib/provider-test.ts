import "server-only";
import { checkPublicHttpsUrl } from "@/lib/validate";
import type { ProviderId } from "@/lib/providers";

/**
 * "Test connection": one cheap, authenticated, read-only call per provider
 * (listing models). The same containment as the health probe:
 *  - fixed provider hosts, or a URL that passed checkPublicHttpsUrl (again,
 *    here, on use);
 *  - the key goes in a header only, never in the URL;
 *  - redirects are never followed;
 *  - the response body is never read, so nothing the provider sends back
 *    (which could echo the key) can reach a page, a log or the audit row.
 * The caller rate-limits tests per connection.
 */

export type TestResult = { ok: boolean; message: string };

const TIMEOUT_MS = 8000;

function request(provider: ProviderId, config: Record<string, string>, key: string): { url: string; headers: Record<string, string> } | { error: string } {
  switch (provider) {
    case "anthropic": {
      const base = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "");
      return { url: `${base}/v1/models?limit=1`, headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } };
    }
    case "openai": {
      const h: Record<string, string> = { authorization: `Bearer ${key}` };
      if (config.organization) h["openai-organization"] = config.organization;
      if (config.project) h["openai-project"] = config.project;
      return { url: "https://api.openai.com/v1/models", headers: h };
    }
    case "gemini":
      return { url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", headers: { "x-goog-api-key": key } };
    case "mistral":
      return { url: "https://api.mistral.ai/v1/models", headers: { authorization: `Bearer ${key}` } };
    case "azure_openai": {
      const c = checkPublicHttpsUrl(config.endpoint ?? "");
      if (!c.ok) return { error: `Endpoint refused: ${c.reason}` };
      const v = encodeURIComponent(config.apiVersion ?? "");
      return { url: `${c.url.protocol}//${c.url.host}/openai/models?api-version=${v}`, headers: { "api-key": key } };
    }
    case "custom": {
      const url = `${(config.baseUrl ?? "").replace(/\/$/, "")}${config.testPath ?? ""}`;
      const c = checkPublicHttpsUrl(url);
      if (!c.ok) return { error: `Base URL refused: ${c.reason}` };
      const name = config.headerName ?? "";
      if (!/^[A-Za-z0-9-]{1,40}$/.test(name)) return { error: "Auth header name is not valid." };
      const value = config.headerPrefix ? `${config.headerPrefix} ${key}` : key;
      return { url: c.url.toString(), headers: { [name]: value } };
    }
  }
}

export async function testProvider(provider: ProviderId, config: Record<string, string>, key: string): Promise<TestResult> {
  const req = request(provider, config, key);
  if ("error" in req) return { ok: false, message: req.error };
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(req.url, {
      method: "GET",
      headers: { accept: "application/json", ...req.headers },
      redirect: "manual",
      signal: controller.signal,
      cache: "no-store",
    });
    // Body intentionally never read; release the connection.
    res.body?.cancel().catch(() => {});
    const ms = Date.now() - started;
    const s = res.status;
    if (s >= 200 && s < 300) return { ok: true, message: `Connected (HTTP ${s}, ${ms} ms)` };
    if (s === 401 || s === 403) return { ok: false, message: `Key rejected (HTTP ${s})` };
    if (s === 429) return { ok: true, message: "Reached and authenticated, but rate-limited (HTTP 429)" };
    if (s >= 300 && s < 400) return { ok: false, message: `Redirected (HTTP ${s}) — not followed` };
    if (s === 404) return { ok: false, message: "Not found (HTTP 404) — check the endpoint or path" };
    return { ok: false, message: `Unexpected answer (HTTP ${s})` };
  } catch {
    return {
      ok: false,
      message: controller.signal.aborted ? `No answer within ${TIMEOUT_MS / 1000} s` : "Could not reach the provider",
    };
  } finally {
    clearTimeout(timer);
  }
}
