import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { getStrings } from "@/lib/strings";
import { localePath, toLocale } from "@/lib/i18n";
import { canUseAssistant, getSessionEmail, hasAuthConfig } from "@/lib/auth";
import { getAiSettings } from "@/lib/ai-settings";
import { AssistantChat } from "./AssistantChat";
import { assistantLogout } from "./actions";

/**
 * Staff-only, and therefore dynamic: it reads the session cookie. That is
 * fine HERE because this is its own route -- the public catalog, about and
 * tool pages never read cookies and stay prerendered (check the build
 * output: /[locale] and /[locale]/tools/[slug] must stay ●, only this route
 * and its login page are ƒ). The proxy matcher is NOT widened for this: the
 * page does its own check, which is the real boundary anyway.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AssistantPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = toLocale((await params).locale);
  const t = getStrings(locale);
  const a = t.assistant;

  if (!hasAuthConfig()) redirect(localePath(locale, "/assistant/login"));
  const email = await getSessionEmail();
  if (!email || !(await canUseAssistant(email))) redirect(localePath(locale, "/assistant/login"));

  let configured = false;
  try {
    const s = await getAiSettings();
    configured = s.enabled && (s.envKey || (s.hasStoredKey && s.storedKeyReadable));
  } catch {
    configured = false;
  }

  return (
    <>
      <Header locale={locale} path="/assistant" />
      <main className="mx-auto flex max-w-[760px] flex-col px-4 pb-10 pt-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{a.title}</h1>
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{a.intro}</p>
          </div>
          <form action={assistantLogout} className="shrink-0">
            <input type="hidden" name="locale" value={locale} />
            <button type="submit" className="rounded border px-3 text-xs"
              style={{ minHeight: 36, borderColor: "var(--control-border)", color: "var(--muted)" }}>
              {a.signOut}
            </button>
          </form>
        </div>
        <p className="mt-1 truncate text-xs" style={{ color: "var(--faint)" }}>{email}</p>

        {configured ? (
          <AssistantChat locale={locale} />
        ) : (
          <p className="mt-10 rounded-lg border p-4 text-sm" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
            {a.notConfigured}
          </p>
        )}
      </main>
    </>
  );
}
