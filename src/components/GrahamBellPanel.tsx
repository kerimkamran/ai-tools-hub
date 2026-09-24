"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getStrings } from "@/lib/strings";
import { localePath, type Locale } from "@/lib/i18n";
import { assistantLogout } from "@/app/[locale]/assistant/actions";
import { AssistantChat } from "@/components/AssistantChat";
import { GrahamBellIllustration } from "@/components/GrahamBellIllustration";

type Who = { signedIn: boolean; email?: string };

/**
 * Graham Bell, embedded on the home page itself (not a separate /assistant
 * route). The home page stays static/cookie-free for ISR, so sign-in state
 * is resolved client-side, after hydration, against /api/assistant/whoami --
 * the same reasoning as the theme toggle. Until that resolves (and for
 * every anonymous visitor) this renders the signed-out invitation only:
 * no question box, nothing that could look like a working assistant.
 */
export function GrahamBellPanel({ locale, careersUrl }: { locale: Locale; careersUrl: string | null }) {
  const t = getStrings(locale).assistant;
  const [who, setWho] = useState<Who>({ signedIn: false });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/assistant/whoami", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Who>) : { signedIn: false }))
      .then((data) => {
        if (!cancelled) setWho(data);
      })
      .catch(() => {
        if (!cancelled) setWho({ signedIn: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      className="mt-6 rounded-xl border p-5 sm:p-6"
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
      aria-label={t.title}
    >
      <div className="flex items-start gap-4">
        <GrahamBellIllustration size={who.signedIn ? 56 : 84} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold">{t.bot}</p>

          {who.signedIn ? (
            <>
              <p className="mt-0.5 truncate text-xs" style={{ color: "var(--faint)" }}>{who.email}</p>
              <form action={assistantLogout} className="mt-2 inline-block">
                <input type="hidden" name="locale" value={locale} />
                <button
                  type="submit"
                  className="rounded border px-3 text-xs"
                  style={{ minHeight: 32, borderColor: "var(--control-border)", color: "var(--muted)" }}
                >
                  {t.signOut}
                </button>
              </form>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{t.homeSignInPrompt}</p>
              <Link
                href={localePath(locale, "/assistant/login")}
                className="mt-3 inline-flex items-center rounded-md px-4 text-sm font-medium"
                style={{ minHeight: 40, background: "var(--foreground)", color: "var(--background)" }}
              >
                {t.signIn}
              </Link>
              <p className="mt-4 text-xs" style={{ color: "var(--faint)" }}>
                {t.homeApplyPrompt}
                {careersUrl && (
                  <>
                    {" "}
                    <a
                      href={careersUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2"
                      style={{ color: "var(--primary)" }}
                    >
                      {t.homeApplyLink}
                    </a>
                  </>
                )}
              </p>
            </>
          )}
        </div>
      </div>

      {who.signedIn && <AssistantChat locale={locale} />}
    </section>
  );
}
