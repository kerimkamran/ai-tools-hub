"use client";

import { useEffect, useState } from "react";
import { getStrings } from "@/lib/strings";
import type { Locale } from "@/lib/i18n";

const KEY = "hub-theme";

export function ThemeToggle({ locale }: { locale: Locale }) {
  const strings = getStrings(locale);
  const [dark, setDark] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    setReady(true);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(KEY, next ? "dark" : "light");
    } catch {
      // Private mode or blocked site data: the toggle still works for this
      // page view, it just will not be remembered. Never let this throw.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? strings.themeToLight : strings.themeToDark}
      className="flex items-center justify-center rounded-full transition-opacity hover:opacity-70"
      style={{ width: 44, height: 44, color: "var(--muted)" }}
    >
      {/* Rendered only after mount so the icon cannot disagree with the class
          the no-flash script applied before hydration. */}
      <span aria-hidden="true" className="text-base leading-none">
        {ready ? (dark ? "◑" : "◐") : "○"}
      </span>
    </button>
  );
}
