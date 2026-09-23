"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Tool } from "@/lib/types";
import { strings } from "@/lib/strings";
import { categoriesOf, filterTools } from "@/lib/search";
import { CategoryChips } from "./CategoryChips";
import { ToolGrid } from "./ToolGrid";

/**
 * Receives the full, server-rendered tool list and filters it in memory.
 *
 * For a catalog this size that is the right answer: no search service, no
 * embeddings, no network round-trip per keystroke. The visual filter is
 * synchronous; only the screen-reader announcement is debounced, so assistive
 * tech is not flooded with one message per character.
 */
export function SearchAndFilter({ tools }: { tools: Tool[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [announced, setAnnounced] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const categories = useMemo(() => categoriesOf(tools), [tools]);
  const results = useMemo(
    () => filterTools(tools, query, category),
    [tools, query, category]
  );

  // Read ?q= on the client. Doing this on the server would make the whole
  // catalog route dynamic; here it costs one effect and keeps the page static.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setQuery(q.slice(0, 100));
  }, []);

  // Autofocus on pointer-fine devices only. On a phone, autofocus raises the
  // keyboard and buries the catalog the visitor came to see.
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) {
      inputRef.current?.focus({ preventScroll: true });
    }
  }, []);

  /**
   * Escape clears the field.
   *
   * There is deliberately NO global "/" shortcut. A single-character shortcut
   * that is live across the whole document fails WCAG 2.1.4 (Character Key
   * Shortcuts, Level A) unless it can be turned off, remapped, or is active
   * only on focus -- and speech-input users hit these constantly, because
   * dictation emits stray characters. This handler is bound to the input, so
   * it only fires when the input already has focus, which is the "active only
   * on focus" exception. Desktop autofocus covers the same need anyway.
   */
  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setQuery("");
      inputRef.current?.blur();
    }
  }, []);

  // Shareable, back-button-safe URL without a history entry per keystroke.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url.toString());
  }, [query]);

  /**
   * Announcement includes the active filters, not just the count. Keyed on
   * the count alone, switching between two filters that happen to match the
   * same number of tools produced no announcement at all -- a screen-reader
   * user would hear nothing and assume nothing had changed.
   */
  useEffect(() => {
    const parts = [strings.resultCount(results.length)];
    if (query) parts.push(`for "${query}"`);
    if (category) parts.push(`in ${category}`);
    const t = setTimeout(() => setAnnounced(parts.join(" ")), 150);
    return () => clearTimeout(t);
  }, [results.length, query, category]);

  const reset = useCallback(() => {
    setQuery("");
    setCategory(null);
    inputRef.current?.focus();
  }, []);

  return (
    <>
      <search>
        <div className="mx-auto w-full max-w-[560px]">
          <label htmlFor="tool-search" className="sr-only">
            {strings.searchLabel}
          </label>
          <div
            className="flex items-center gap-2.5 rounded-full border pl-4 pr-1.5"
            style={{ height: 48, borderColor: "var(--control-border)", background: "var(--surface)" }}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              className="h-4 w-4 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              style={{ color: "var(--faint)" }}
            >
              <circle cx="7" cy="7" r="4.5" />
              <path d="m10.5 10.5 3 3" strokeLinecap="round" />
            </svg>
            <input
              id="tool-search"
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={strings.searchPlaceholder}
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none"
              style={{ color: "var(--foreground)" }}
            />
            {query && (
              // 44x44 like every other target here. It was an ~18px hit area,
              // which is exactly the control someone with a tremor needs most.
              <button
                type="button"
                onClick={reset}
                aria-label={strings.clear}
                className="flex shrink-0 items-center justify-center rounded-full text-lg leading-none hover:opacity-70"
                style={{ width: 44, height: 44, color: "var(--muted)" }}
              >
                <span aria-hidden="true">&times;</span>
              </button>
            )}
          </div>
        </div>

        <div className="mt-5">
          <CategoryChips categories={categories} active={category} onChange={setCategory} />
        </div>
      </search>

      <p aria-live="polite" className="sr-only">
        {announced}
      </p>

      <div className="mt-8">
        {results.length > 0 ? (
          <ToolGrid tools={results} />
        ) : (
          <div className="py-12 text-center">
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              {query ? strings.noMatch(query) : strings.noToolsYet}
            </p>
            {(query || category) && (
              <button
                type="button"
                onClick={reset}
                className="mt-3 rounded-full border px-4 text-sm hover:opacity-70"
                style={{ minHeight: 44, borderColor: "var(--control-border)", color: "var(--foreground)" }}
              >
                {strings.clear}
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
