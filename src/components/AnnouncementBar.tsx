"use client";

import { useEffect, useState } from "react";

/**
 * One announcement banner. Dismissal is remembered in this browser only
 * (localStorage, wrapped in try/catch) -- never a cookie, so the catalog
 * stays cookie-free and static. Critical announcements cannot be dismissed.
 */
const COLORS = { info: "var(--primary)", warning: "var(--warning)", critical: "var(--critical)" } as const;

export function AnnouncementBar({ id, severity, text, closeLabel }: { id: number; severity: "info" | "warning" | "critical"; text: string; closeLabel: string }) {
  const [hidden, setHidden] = useState(false);
  const key = `announcement-dismissed-${id}`;
  useEffect(() => {
    try {
      if (severity !== "critical" && localStorage.getItem(key) === "1") setHidden(true); // eslint-disable-line react-hooks/set-state-in-effect
    } catch {
      // storage blocked: keep showing it
    }
  }, [key, severity]);
  if (hidden) return null;
  return (
    <div role={severity === "critical" ? "alert" : "status"} className="border-b" style={{ borderColor: COLORS[severity], background: "var(--surface)" }}>
      <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-3 px-4 py-2 text-sm" style={{ color: COLORS[severity] }}>
        <p>{text}</p>
        {severity !== "critical" && (
          <button type="button" aria-label={closeLabel} onClick={() => {
            setHidden(true);
            try { localStorage.setItem(key, "1"); } catch { /* ignore */ }
          }} className="flex shrink-0 items-center justify-center rounded" style={{ minWidth: 44, minHeight: 44 }}>
            <span aria-hidden="true">×</span>
          </button>
        )}
      </div>
    </div>
  );
}
