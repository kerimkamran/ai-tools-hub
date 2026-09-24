import "server-only";

/**
 * Outbound transactional email, for exactly one thing today: the
 * self-service assistant sign-in link (requestAssistantLink in
 * src/app/[locale]/assistant/actions.ts). Render has no email product of
 * its own, so this calls Resend's HTTP API directly -- one fixed host, the
 * key in a header, never in a URL, and the response body is never trusted
 * with anything sensitive.
 *
 * Until RESEND_API_KEY is set, hasMailConfig() is false and callers fall
 * back to the existing admin-invite flow (copy the link, send it yourself).
 * No plaintext password or token is ever logged.
 */

const RESEND_URL = "https://api.resend.com/emails";

export function hasMailConfig(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function fromAddress(): string {
  return process.env.MAIL_FROM || "One.Simple <onboarding@resend.dev>";
}

export type SendMailResult = { ok: boolean; error?: string };

export async function sendMail(to: string, subject: string, text: string): Promise<SendMailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "not_configured" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from: fromAddress(), to, subject, text }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, error: `provider responded ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: controller.signal.aborted ? "timed out" : err instanceof Error ? err.message : "send failed" };
  } finally {
    clearTimeout(timer);
  }
}
