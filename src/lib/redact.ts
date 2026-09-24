/**
 * Redaction for anything that leaves the server as a record: audit diffs,
 * exports, error messages. Pure and dependency-free so tests can load it.
 *
 * Any key that looks like a secret is replaced. A value that looks like an
 * API key is replaced wherever it appears, even under an innocent key name.
 */

const SECRET_KEY = /(^|_|-)(key|apikey|api_key|secret|password|passwd|token|hash|totp|recovery|encrypted|authorization|cookie)s?($|_|-)|password|secret|encrypted|recovery|totp|apikey|api_key|token_hash|password_hash/i;

const SECRET_VALUE = /\b(sk-(ant-)?[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}|v1:[A-Za-z0-9+/=]{24,}|\$2[aby]\$\d{2}\$[./A-Za-z0-9]{50,})/g;

export function redactString(s: string): string {
  return s.replace(SECRET_VALUE, "[redacted]");
}

export function redactForAudit(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[truncated]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redactForAudit(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === "last4" || k === "keyLast4" || k === "api_key_last4" || k === "key_last4") {
      out[k] = v;
    } else if (SECRET_KEY.test(k)) {
      out[k] = v === null || v === undefined || v === "" ? v : "[redacted]";
    } else {
      out[k] = redactForAudit(v, depth + 1);
    }
  }
  return out;
}

/** "rotated, last4 …a1b2" -- how a key change is described in the log. */
export function keyRotationNote(last4: string | null | undefined): string {
  return last4 ? `rotated, last4 …${last4}` : "removed";
}
