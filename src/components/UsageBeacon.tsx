"use client";

import { useEffect } from "react";
import type { Locale } from "@/lib/i18n";

/**
 * Counts tool opens with one delegated click listener (capability 10). Sends
 * only { event, tool id, language } via sendBeacon -- no cookie, no id, and
 * the page itself stays static.
 */
export function sendUsage(payload: Record<string, string>) {
  try {
    const data = JSON.stringify(payload);
    if (!navigator.sendBeacon?.("/api/usage", data)) {
      fetch("/api/usage", { method: "POST", body: data, keepalive: true }).catch(() => {});
    }
  } catch {
    // counting must never break the page
  }
}

export function UsageBeacon({ locale }: { locale: Locale }) {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-tool-open]");
      const id = el?.dataset.toolOpen;
      if (id) sendUsage({ e: "open", t: id, l: locale });
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("auxclick", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("auxclick", onClick, true);
    };
  }, [locale]);
  return null;
}
