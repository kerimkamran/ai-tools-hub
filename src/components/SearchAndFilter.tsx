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

  // "/" focuses search from anywhere; Escape clears and blurs.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const typing =
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable);

      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === "Escape" && el === inputRef.current) {
        setQuery("");
        inputRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Shareable, back-button-safe URL without adding a history entry per keystroke.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url.toString());
  }, [query]);

  // Debounced announcement only.
  useEffect(() => {
    const t = setTimeout(() => setAnnounced(strings.resultCount(results.length)), 120);
    return () => clearTimeout(t);
  }, [results.length]);

  const reset = useCallback(() => {
    setQuery("");
    setCategory(null);
    inputRef.current?.focus();
  }, []);

  return (
    <>
      <div className="mx-auto w-full max-w-[560px]">
        <label htmlFor="tool-search" className="sr-only">
          {strings.searchLabel}
        </label>
        <div
          className="flex items-center gap-2.5 rounded-full border px-4 transition-colors"
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
            placeholder={strings.searchPlaceholder}
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none"
            style={{ color: "var(--foreground)" }}
          />
          {query && (
            <button
              type="button"
              onClick={reset}
              aria-label={strings.clear}
              className="shrink-0 rounded-full px-1 text-lg leading-none hover:opacity-70"
              style={{ color: "var(--faint)" }}
            >
              &times;
            </button>
          )}
        </div>
      </div>

      <div className="mt-5">
        <CategoryChips categories={categories} active={category} onChange={setCategory} />
      </div>

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
                className="mt-3 rounded-full border px-4 py-2 text-sm hover:opacity-70"
                style={{ borderColor: "var(--control-border)", color: "var(--foreground)" }}
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
