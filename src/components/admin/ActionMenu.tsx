"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";

/**
 * The dynamic action button (Admin Panel Plan, "Interface design").
 *
 * Collapsed it is ONE button ("⋯" for row actions, "+" for create). It
 * expands on hover (after ~150 ms, so passing the pointer over it does not
 * flicker), on keyboard focus + Enter/Space/ArrowDown, or on tap -- never
 * hover-only. It stays open while the pointer moves into it, closes on
 * Escape or clicking elsewhere (WCAG 1.4.13), and returns focus to the
 * button. Arrow keys move between items. Targets are at least 44 × 44 px
 * and every item has a text label.
 *
 * Destructive items sit last, visually separated, and when `confirm` is set
 * they ask for the given text to be typed before they run.
 */

export type ActionItem =
  | { label: string; href: string; destructive?: false }
  | {
      label: string;
      onSelect: (confirmValue?: string) => void;
      destructive?: boolean;
      /** Typed confirmation: the user must type `expected` exactly. */
      confirm?: { prompt: string; expected: string };
    };

export function ActionMenu({
  items,
  label,
  glyph = "⋯",
}: {
  items: ActionItem[];
  /** Accessible name, e.g. "Actions for sam@azerconnect.az". */
  label: string;
  glyph?: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuId = useId();

  const safe = items.filter((i) => !i.destructive);
  const destructive = items.filter((i) => i.destructive);
  const ordered = [...safe, ...destructive];

  const close = useCallback((refocus = true) => {
    setOpen(false);
    setConfirming(null);
    setTyped("");
    if (refocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, [open, close]);

  const focusItem = (index: number) => {
    const els = rootRef.current?.querySelectorAll<HTMLElement>("[data-menu-item]");
    if (!els || els.length === 0) return;
    els[(index + els.length) % els.length].focus();
  };

  const onMenuKey = (e: React.KeyboardEvent) => {
    const els = [...(rootRef.current?.querySelectorAll<HTMLElement>("[data-menu-item]") ?? [])];
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      focusItem(i + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusItem(i - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusItem(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusItem(els.length - 1);
    }
  };

  const openSoon = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), 150);
  };
  const cancelSoon = () => {
    if (timer.current) clearTimeout(timer.current);
  };

  return (
    <div
      ref={rootRef}
      className="relative inline-block"
      onMouseEnter={openSoon}
      onMouseLeave={() => {
        cancelSoon();
        if (confirming === null) setOpen(false);
      }}
      onKeyDown={open ? onMenuKey : undefined}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setOpen(true);
            setTimeout(() => focusItem(0), 0);
          }
        }}
        className="flex items-center justify-center rounded-md border text-lg leading-none"
        style={{
          width: 44,
          height: 44,
          borderColor: open ? "var(--foreground)" : "var(--control-border)",
          color: "var(--foreground)",
          background: "var(--surface)",
        }}
      >
        <span aria-hidden="true">{glyph}</span>
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className="absolute right-0 z-30 mt-1 min-w-[220px] rounded-lg border p-1 shadow-lg"
          style={{ borderColor: "var(--line)", background: "var(--surface)" }}
        >
          {ordered.map((item, i) => {
            const separated = item.destructive && i === safe.length && safe.length > 0;
            const itemClass =
              "flex w-full items-center rounded-md px-3 text-left text-sm hover:opacity-80 focus:outline-2";
            const style = {
              minHeight: 44,
              color: item.destructive ? "var(--critical)" : "var(--foreground)",
            };
            return (
              <div key={item.label}>
                {separated && <div role="separator" className="my-1 border-t" style={{ borderColor: "var(--line)" }} />}
                {"href" in item ? (
                  <Link href={item.href} role="menuitem" data-menu-item className={itemClass} style={style}>
                    {item.label}
                  </Link>
                ) : confirming === i && item.confirm ? (
                  <form
                    className="space-y-2 p-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (typed.trim().toLowerCase() !== item.confirm!.expected.toLowerCase()) return;
                      item.onSelect(typed.trim());
                      close();
                    }}
                  >
                    <label className="block text-xs" style={{ color: "var(--muted)" }}>
                      {item.confirm.prompt}
                      <input
                        autoFocus
                        value={typed}
                        onChange={(e) => setTyped(e.target.value)}
                        className="mt-1 w-full rounded border px-2 py-2 text-sm"
                        style={{ borderColor: "var(--control-border)", background: "var(--background)" }}
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={typed.trim().toLowerCase() !== item.confirm.expected.toLowerCase()}
                        className="rounded px-3 text-sm font-medium disabled:opacity-40"
                        style={{ minHeight: 44, background: "var(--critical)", color: "#fff" }}
                      >
                        {item.label}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirming(null);
                          setTyped("");
                        }}
                        className="rounded border px-3 text-sm"
                        style={{ minHeight: 44, borderColor: "var(--control-border)" }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    data-menu-item
                    className={itemClass}
                    style={style}
                    onClick={() => {
                      if (item.confirm) {
                        setConfirming(i);
                        setTyped("");
                      } else {
                        item.onSelect();
                        close();
                      }
                    }}
                  >
                    {item.label}
                    {item.confirm ? "…" : ""}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
