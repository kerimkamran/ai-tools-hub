"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type NavGroup = { label: string; items: Array<{ label: string; href: string }> };

/**
 * The admin navigation: four top-level items (People & security, Content,
 * AI, Brand & operations). Each opens its pages on hover (~150 ms delay),
 * keyboard (Enter / Space / ArrowDown) or tap; Escape closes and returns
 * focus. Items a role cannot use are never passed in -- and the server still
 * checks every request, so hiding is only tidiness.
 */
export function NavGroups({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  // The open menu is remembered together with the page it was opened on, so
  // navigating closes it without a setState-in-effect.
  const [openAt, setOpenAt] = useState<{ index: number; path: string } | null>(null);
  const open = openAt && openAt.path === pathname ? openAt.index : null;
  const setOpen = (v: number | null | ((o: number | null) => number | null)) =>
    setOpenAt((prev) => {
      const cur = prev && prev.path === pathname ? prev.index : null;
      const next = typeof v === "function" ? v(cur) : v;
      return next === null ? null : { index: next, path: pathname };
    });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenAt(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // "/admin" (the catalog) owns /admin and /admin/tools/*, not every admin page.
  const matches = (href: string) =>
    href === "/admin"
      ? pathname === "/admin" || pathname.startsWith("/admin/tools")
      : pathname === href || pathname.startsWith(href + "/");
  const active = (g: NavGroup) => g.items.some((i) => matches(i.href));

  return (
    <div ref={rootRef} className="flex flex-wrap items-center gap-1 text-sm">
      {groups.map((g, gi) => (
        <div
          key={g.label}
          className="relative"
          onMouseEnter={() => {
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setOpen(gi), 150);
          }}
          onMouseLeave={() => {
            if (timer.current) clearTimeout(timer.current);
            setOpen((o) => (o === gi ? null : o));
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(null);
              (e.currentTarget.querySelector("button") as HTMLButtonElement | null)?.focus();
            }
            if (open === gi && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
              e.preventDefault();
              const links = [...e.currentTarget.querySelectorAll<HTMLElement>("a")];
              const i = links.indexOf(document.activeElement as HTMLElement);
              const next = e.key === "ArrowDown" ? i + 1 : i - 1;
              links[(next + links.length) % links.length]?.focus();
            }
          }}
        >
          <button
            type="button"
            aria-haspopup="true"
            aria-expanded={open === gi}
            onClick={() => setOpen(open === gi ? null : gi)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" && open !== gi) {
                e.preventDefault();
                setOpen(gi);
                setTimeout(() => (e.currentTarget.parentElement?.querySelector("a") as HTMLElement | null)?.focus(), 0);
              }
            }}
            className="rounded px-3 font-medium"
            style={{
              minHeight: 44,
              color: active(g) ? "var(--foreground)" : "var(--muted)",
              textDecoration: active(g) ? "underline" : "none",
              textUnderlineOffset: 6,
            }}
          >
            {g.label} <span aria-hidden="true">▾</span>
          </button>
          {open === gi && (
            <ul
              className="absolute left-0 z-30 mt-0 min-w-[200px] list-none rounded-lg border p-1 shadow-lg"
              style={{ borderColor: "var(--line)", background: "var(--surface)" }}
            >
              {g.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={pathname === item.href ? "page" : undefined}
                    className="flex items-center rounded-md px-3 hover:opacity-80"
                    style={{ minHeight: 44, color: "var(--foreground)" }}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
