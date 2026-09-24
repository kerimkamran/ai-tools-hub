import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { getStrings } from "@/lib/strings";
import { localePath, toLocale } from "@/lib/i18n";
import { getAssistantUserOrNull, getCurrentUser, hasAuthConfig } from "@/lib/auth";
import { assistantLogin, assistantLogout } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

const FIELD = "mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none";
const FIELD_STYLE = { borderColor: "var(--control-border)", background: "var(--surface)" };

export default async function AssistantLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; invited?: string }>;
}) {
  const locale = toLocale((await params).locale);
  const { error, invited } = await searchParams;
  const t = getStrings(locale);
  const a = t.assistant;

  const signedIn = hasAuthConfig() ? await getCurrentUser() : null;
  if (signedIn && (await getAssistantUserOrNull())) redirect(localePath(locale, "/assistant"));
  const email = signedIn?.email ?? null;

  return (
    <>
      <Header locale={locale} path="/assistant/login" />
      <main className="mx-auto max-w-[360px] px-4 pb-24 pt-16">
        <h1 className="text-2xl font-semibold tracking-tight">{a.title}</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>{a.staffOnly}</p>

        {!hasAuthConfig() ? (
          <p className="mt-6 text-sm" style={{ color: "var(--muted)" }}>{a.unavailable}</p>
        ) : email ? (
          <>
            <p className="mt-6 text-sm" style={{ color: "var(--muted)" }}>{a.noAccess}</p>
            <form action={assistantLogout} className="mt-4">
              <input type="hidden" name="locale" value={locale} />
              <button type="submit" className="w-full rounded-md border px-4 text-sm"
                style={{ minHeight: 44, borderColor: "var(--control-border)", color: "var(--foreground)" }}>
                {a.signOut}
              </button>
            </form>
          </>
        ) : (
          <form action={assistantLogin} className="mt-8 space-y-3">
            <input type="hidden" name="locale" value={locale} />
            <div>
              <label htmlFor="email" className="block text-sm" style={{ color: "var(--muted)" }}>{a.email}</label>
              <input id="email" name="email" type="email" required autoComplete="username"
                className={FIELD} style={FIELD_STYLE} />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm" style={{ color: "var(--muted)" }}>{a.password}</label>
              <input id="password" name="password" type="password" required autoComplete="current-password"
                className={FIELD} style={FIELD_STYLE} />
            </div>
            {invited === "1" && !error && (
              <p className="text-sm" style={{ color: "var(--good)" }}>{a.passwordSet}</p>
            )}
            {error === "locked" && (
              <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>{a.locked}</p>
            )}
            {error && error !== "locked" && (
              <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>{a.signInFailed}</p>
            )}
            <button type="submit" className="w-full rounded-md px-4 text-sm font-medium"
              style={{ minHeight: 44, background: "var(--foreground)", color: "var(--background)" }}>
              {a.signIn}
            </button>
          </form>
        )}
      </main>
    </>
  );
}
