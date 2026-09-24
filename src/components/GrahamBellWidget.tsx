"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getStrings } from "@/lib/strings";
import { localePath, type Locale } from "@/lib/i18n";
import { assistantLogout } from "@/app/[locale]/assistant/actions";
import { AssistantChat } from "@/components/AssistantChat";
import { GrahamBellIllustration } from "@/components/GrahamBellIllustration";

type Who = { signedIn: boolean; email?: string };

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 3l10 10M13 3 3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Graham Bell, floating in the corner of every public page (not one embedded
 * card on the home page) -- a small launcher that opens into a chat window,
 * the familiar site-widget pattern. The page underneath (including the home
 * page's ISR/cookie-free catalog) never changes: this is a client component
 * mounted once in the locale layout, and sign-in state is resolved after
 * hydration against /api/assistant/whoami, same reasoning as the theme
 * toggle. Signed out, opening it shows the invitation only -- never a
 * question box -- so nothing here can look like a working assistant before
 * sign-in.
 */
export function GrahamBellWidget({ locale, careersUrl }: { locale: Locale; careersUrl: string | null }) {
  const t = getStrings(locale).assistant;
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState<Who>({ signedIn: false });
  const pathname = usePathname();

  // This widget is mounted once in the locale layout, so it survives a
  // client-side (soft) navigation -- including the one from /assistant/login
  // straight to sign-in success. Re-checking only on mount would leave it
  // stuck showing "signed out" after that redirect, since the component
  // instance never remounts. Re-running whenever the path changes (sign-in,
  // sign-out and the plain "come back later" case all change the URL) or the
  // widget is opened keeps it honest without polling.
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
  }, [pathname, open]);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end sm:bottom-6 sm:right-6">
      {open && (
        <div
          className="mb-3 flex h-[min(70vh,540px)] w-[min(92vw,360px)] flex-col overflow-hidden rounded-2xl border"
          style={{ borderColor: "var(--line)", background: "var(--surface)", boxShadow: "var(--shadow-md)" }}
          role="dialog"
          aria-label={t.title}
        >
          <div className="flex items-center gap-3 border-b p-3" style={{ borderColor: "var(--line)" }}>
            <GrahamBellIllustration size={36} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t.bot}</p>
              {who.signedIn && (
                <p className="truncate text-[11px]" style={{ color: "var(--faint)" }}>{who.email}</p>
              )}
            </div>
            {who.signedIn && (
              <form action={assistantLogout}>
                <input type="hidden" name="locale" value={locale} />
                <button
                  type="submit"
                  className="rounded border px-2 py-1 text-[11px]"
                  style={{ borderColor: "var(--control-border)", color: "var(--muted)" }}
                >
                  {t.signOut}
                </button>
              </form>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t.title}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full hover:opacity-70"
              style={{ color: "var(--muted)" }}
            >
              <CloseIcon />
            </button>
          </div>

          {who.signedIn ? (
            <AssistantChat locale={locale} />
          ) : (
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4 pt-6">
              <p className="text-sm" style={{ color: "var(--muted)" }}>{t.homeSignInPrompt}</p>
              <Link
                href={localePath(locale, "/assistant/login")}
                className="inline-flex w-fit items-center rounded-md px-4 text-sm font-medium"
                style={{ minHeight: 40, background: "var(--foreground)", color: "var(--background)" }}
              >
                {t.signIn}
              </Link>
              <p className="text-xs" style={{ color: "var(--faint)" }}>
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
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t.bot}
        aria-expanded={open}
        className="flex h-14 w-14 items-center justify-center rounded-full hover:opacity-90"
        style={{ background: "var(--surface)", boxShadow: "var(--shadow-md)", border: "1px solid var(--line)" }}
      >
        {open ? <CloseIcon /> : <GrahamBellIllustration size={44} />}
      </button>
    </div>
  );
}
