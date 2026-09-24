"use client";

import { useCallback, useRef, useState } from "react";
import { getStrings } from "@/lib/strings";
import type { Locale } from "@/lib/i18n";
import { MAX_QUESTION_CHARS } from "@/lib/assistant-limits";
import { GrahamBellIllustration } from "@/components/GrahamBellIllustration";

type Msg = { role: "user" | "assistant"; content: string; error?: boolean; r?: string; tt?: string; rated?: 1 | -1 };

/**
 * Links in answers: this hub's own tool pages (/xx/tools/slug) open in the
 * same tab; https links open in a new one. Everything else is plain text --
 * the answer is never rendered as HTML, so a model reply cannot inject markup.
 */
const LINK = /(https:\/\/[^\s)<>"']+|\/(?:en|az|ru)\/tools\/[a-z0-9-]+)/g;

function Linkified({ text }: { text: string }) {
  const parts = text.split(LINK);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return <span key={i}>{part}</span>;
        const external = part.startsWith("https://");
        const href = part.replace(/[.,;:!?]+$/, "");
        const trailing = part.slice(href.length);
        return (
          <span key={i}>
            <a
              href={href}
              {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className="underline underline-offset-2"
              style={{ color: "var(--primary)" }}
            >
              {href}
            </a>
            {trailing}
          </span>
        );
      })}
    </>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M2.5 10 17 3l-5 14-2.8-6.2L2.5 10Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/**
 * A compact, chat-bubble conversation -- built to live inside Graham Bell's
 * floating widget (a fixed-height column), not a full page. User bubbles
 * align right, his align left with a small avatar; while an answer streams
 * in an empty bubble shows a bouncing "typing" indicator instead of a plain
 * "Thinking…" label, so the widget feels alive rather than like a form.
 */
export function AssistantChat({ locale }: { locale: Locale }) {
  const t = getStrings(locale).assistant;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const errorText = useCallback(
    (code: string) =>
      ({
        rate_limited: t.rateLimited,
        daily_limited: t.dailyLimited,
        budget: t.budgetReached,
        not_configured: t.notConfigured,
        too_long: t.tooLong(MAX_QUESTION_CHARS),
        unauthorized: t.noAccess,
        forbidden: t.noAccess,
      })[code] ?? t.error,
    [t]
  );

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || busy) return;
    if (question.length > MAX_QUESTION_CHARS) return;

    const history = messages.filter((m) => !m.error);
    const next: Msg[] = [...history, { role: "user", content: question }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const setAnswer = (content: string, error = false) =>
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        copy[copy.length - 1] = { ...last, role: "assistant", content, error };
        return copy;
      });
    const setTokens = (r?: string, tt?: string) =>
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { ...copy[copy.length - 1], r, tt };
        return copy;
      });

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale,
          messages: next.map(({ role, content }) => ({ role, content })),
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setAnswer(errorText(j.error ?? ""), true);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";
      let finished = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const l of lines) {
          if (!l.trim()) continue;
          const ev = JSON.parse(l) as { t: string; v?: string; code?: string; r?: string; tt?: string };
          if (ev.t === "meta") {
            setTokens(ev.r, ev.tt);
          } else if (ev.t === "text" && ev.v) {
            answer += ev.v;
            setAnswer(answer);
          } else if (ev.t === "done") {
            finished = true;
          } else if (ev.t === "error") {
            setAnswer(answer ? `${answer}\n\n${t.error}` : t.error, true);
            finished = true;
          }
        }
      }
      if (!finished) setAnswer(answer ? `${answer}\n\n${t.error}` : t.error, true);
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") setAnswer(t.error, true);
    } finally {
      setBusy(false);
      abortRef.current = null;
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }));
    }
  }

  async function rate(index: number, rating: 1 | -1) {
    const m = messages[index];
    if (!m?.r || m.rated) return;
    setMessages((prev) => prev.map((x, i) => (i === index ? { ...x, rated: rating } : x)));
    await fetch("/api/assistant/rate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ r: m.r, tt: m.tt, rating }),
    }).catch(() => {});
  }

  function reset() {
    abortRef.current?.abort();
    setMessages([]);
    setInput("");
    setBusy(false);
  }

  const over = input.length > MAX_QUESTION_CHARS;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ol className="flex min-h-0 flex-1 list-none flex-col gap-2 overflow-y-auto p-3" aria-live="polite" aria-busy={busy}>
        {messages.length === 0 && (
          <li className="flex justify-start">
            <div className="flex max-w-[85%] items-end gap-2">
              <GrahamBellIllustration size={20} className="mb-1 shrink-0" />
              <div
                className="rounded-2xl rounded-bl-[4px] px-3 py-2 text-sm leading-relaxed"
                style={{ background: "var(--surface-sunken)", color: "var(--foreground)" }}
              >
                {t.intro}
              </div>
            </div>
          </li>
        )}
        {messages.map((m, i) => {
          const isUser = m.role === "user";
          const typing = !isUser && !m.content && busy && i === messages.length - 1;
          return (
            <li key={i} className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
              <div className="flex max-w-[85%] items-end gap-2">
                {!isUser && <GrahamBellIllustration size={20} className="mb-1 shrink-0" />}
                <div
                  className="rounded-2xl px-3 py-2 text-sm leading-relaxed"
                  style={{
                    background: m.error
                      ? "color-mix(in srgb, var(--critical) 12%, var(--surface))"
                      : isUser
                        ? "var(--foreground)"
                        : "var(--surface-sunken)",
                    color: m.error ? "var(--critical)" : isUser ? "var(--background)" : "var(--foreground)",
                    borderBottomRightRadius: isUser ? 4 : undefined,
                    borderBottomLeftRadius: !isUser ? 4 : undefined,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {typing ? (
                    <span className="typing-dots inline-flex items-center gap-1" aria-label={t.sending} role="status">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--muted)" }} />
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--muted)" }} />
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--muted)" }} />
                    </span>
                  ) : isUser ? (
                    m.content
                  ) : (
                    <Linkified text={m.content} />
                  )}
                </div>
              </div>
              {!isUser && m.r && !m.error && !typing && (
                <div className="mt-1 flex items-center gap-1 pl-7 text-xs" style={{ color: "var(--muted)" }}>
                  {m.rated ? (
                    <span role="status">{t.rateThanks}</span>
                  ) : (
                    <>
                      <button type="button" onClick={() => rate(i, 1)} aria-label={t.rateHelpful}
                        className="flex items-center justify-center rounded-md"
                        style={{ minWidth: 28, minHeight: 28 }}>
                        <span aria-hidden="true">👍</span>
                      </button>
                      <button type="button" onClick={() => rate(i, -1)} aria-label={t.rateNotHelpful}
                        className="flex items-center justify-center rounded-md"
                        style={{ minWidth: 28, minHeight: 28 }}>
                        <span aria-hidden="true">👎</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
        <div ref={endRef} />
      </ol>

      <form onSubmit={send} className="flex flex-col gap-1 border-t p-2" style={{ borderColor: "var(--line)" }}>
        <div className="flex items-end gap-2">
          <label htmlFor="assistant-input" className="sr-only">{t.placeholder}</label>
          <textarea
            id="assistant-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={1}
            placeholder={t.placeholder}
            className="max-h-24 flex-1 resize-none rounded-2xl border px-3 py-2 text-sm outline-none"
            style={{ borderColor: over ? "var(--critical)" : "var(--control-border)", background: "var(--surface)", color: "var(--foreground)" }}
            aria-invalid={over || undefined}
            aria-describedby="assistant-count"
          />
          <button type="submit" disabled={busy || !input.trim() || over} aria-label={t.send}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
            style={{ background: "var(--foreground)", color: "var(--background)" }}>
            <SendIcon />
          </button>
        </div>
        <div className="flex items-center justify-between gap-3 px-1">
          <span id="assistant-count" className="text-[11px]" style={{ color: over ? "var(--critical)" : "var(--faint)" }}>
            {over ? t.tooLong(MAX_QUESTION_CHARS) : `${input.length}/${MAX_QUESTION_CHARS}`}
          </span>
          {messages.length > 0 && (
            <button type="button" onClick={reset} className="text-[11px] underline underline-offset-2"
              style={{ color: "var(--muted)" }}>
              {t.newChat}
            </button>
          )}
        </div>
        <p className="px-1 text-[10px] leading-tight" style={{ color: "var(--faint)" }}>{t.disclaimer}</p>
      </form>
    </div>
  );
}
