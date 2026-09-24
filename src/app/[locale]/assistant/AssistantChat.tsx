"use client";

import { useCallback, useRef, useState } from "react";
import { getStrings } from "@/lib/strings";
import type { Locale } from "@/lib/i18n";
import { MAX_QUESTION_CHARS } from "@/lib/assistant-limits";

type Msg = { role: "user" | "assistant"; content: string; error?: boolean };

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
        copy[copy.length - 1] = { role: "assistant", content, error };
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
          const ev = JSON.parse(l) as { t: string; v?: string; code?: string };
          if (ev.t === "text" && ev.v) {
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

  function reset() {
    abortRef.current?.abort();
    setMessages([]);
    setInput("");
    setBusy(false);
  }

  const over = input.length > MAX_QUESTION_CHARS;

  return (
    <section className="mt-8 flex flex-col gap-4" aria-label={t.title}>
      <ol className="flex list-none flex-col gap-4 p-0" aria-live="polite" aria-busy={busy}>
        {messages.map((m, i) => (
          <li
            key={i}
            className="rounded-lg border p-4"
            style={{
              borderColor: m.error ? "var(--critical)" : "var(--line)",
              background: m.role === "user" ? "var(--surface-sunken)" : "var(--surface)",
            }}
          >
            <p className="text-xs font-semibold" style={{ color: "var(--faint)" }}>
              {m.role === "user" ? t.you : t.bot}
            </p>
            <div
              className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-relaxed"
              style={{ color: m.error ? "var(--critical)" : "var(--foreground)" }}
            >
              {m.role === "assistant" && !m.content && busy ? (
                <span style={{ color: "var(--muted)" }}>{t.sending}</span>
              ) : m.role === "assistant" ? (
                <Linkified text={m.content} />
              ) : (
                m.content
              )}
            </div>
          </li>
        ))}
      </ol>
      <div ref={endRef} />

      <form onSubmit={send} className="flex flex-col gap-2">
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
          rows={3}
          placeholder={t.placeholder}
          className="w-full resize-y rounded-lg border px-3 py-2 text-[15px] outline-none"
          style={{ borderColor: over ? "var(--critical)" : "var(--control-border)", background: "var(--surface)", color: "var(--foreground)" }}
          aria-invalid={over || undefined}
          aria-describedby="assistant-count"
        />
        <div className="flex items-center justify-between gap-3">
          <span id="assistant-count" className="text-xs" style={{ color: over ? "var(--critical)" : "var(--faint)" }}>
            {over ? t.tooLong(MAX_QUESTION_CHARS) : `${input.length} / ${MAX_QUESTION_CHARS}`}
          </span>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button type="button" onClick={reset} className="rounded-md border px-4 text-sm"
                style={{ minHeight: 44, borderColor: "var(--control-border)", color: "var(--muted)" }}>
                {t.newChat}
              </button>
            )}
            <button type="submit" disabled={busy || !input.trim() || over}
              className="rounded-md px-5 text-sm font-medium disabled:opacity-50"
              style={{ minHeight: 44, background: "var(--foreground)", color: "var(--background)" }}>
              {busy ? t.sending : t.send}
            </button>
          </div>
        </div>
        <p className="text-xs" style={{ color: "var(--faint)" }}>{t.disclaimer}</p>
      </form>
    </section>
  );
}
