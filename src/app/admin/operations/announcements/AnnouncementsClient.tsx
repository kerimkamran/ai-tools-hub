"use client";

import { useActionState, useTransition } from "react";
import { ActionMenu, type ActionItem } from "@/components/admin/ActionMenu";
import { useKeepAction } from "@/components/admin/useKeepAction";
import { announcementAction, saveAnnouncement, type OpsState } from "../actions";

type Row = { id: number; severity: "info" | "warning" | "critical"; text: string; translated: boolean; startsAt: string; endsAt: string | null; createdBy: string | null; state: "live" | "scheduled" | "ended" };
const FIELD = "mt-1 block w-full rounded-md border px-3 text-sm";
const STYLE = { minHeight: 44, borderColor: "var(--control-border)", background: "var(--surface)", color: "var(--foreground)" };
const COLOR = { info: "var(--primary)", warning: "var(--warning)", critical: "var(--critical)" };
const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Baku" });

function AnnRow({ r }: { r: Row }) {
  const [state, dispatch] = useActionState<OpsState, FormData>(announcementAction, {});
  const [pending, start] = useTransition();
  const run = (op: string) => { const fd = new FormData(); fd.set("op", op); fd.set("id", String(r.id)); start(() => dispatch(fd)); };
  const items: ActionItem[] = [];
  if (r.state !== "ended") items.push({ label: "End now", onSelect: () => run("end") });
  items.push({ label: "Delete", destructive: true, confirm: { prompt: "Type delete to remove this announcement", expected: "delete" }, onSelect: () => run("delete") });
  return (
    <li className="rounded-lg border p-3" style={{ borderColor: r.state === "live" ? COLOR[r.severity] : "var(--line)" }}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm">{r.text}</p>
          <p className="text-xs" style={{ color: "var(--faint)" }}>
            <span style={{ color: COLOR[r.severity] }}>● {r.severity}</span> · {r.state} · {fmt(r.startsAt)} → {r.endsAt ? fmt(r.endsAt) : "no end"} · {r.translated ? "translated" : "translation pending"}
          </p>
        </div>
        <ActionMenu items={items} label={`Actions for announcement ${r.id}`} />
      </div>
      {pending && <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>Working…</p>}
      {state.error && <p role="alert" className="mt-2 text-xs" style={{ color: "var(--critical)" }}>{state.error}</p>}
    </li>
  );
}

export function AnnouncementsClient({ rows }: { rows: Row[] }) {
  const [state, onSubmit, pending] = useKeepAction<OpsState>(saveAnnouncement, {});
  return (
    <>
      <form onSubmit={onSubmit} className="mt-6 grid gap-3 rounded-lg border p-4 sm:grid-cols-3" style={{ borderColor: "var(--line)" }}>
        <label className="text-xs sm:col-span-3" style={{ color: "var(--muted)" }}>Message (English, up to 240 characters)
          <input name="text" required maxLength={240} className={FIELD} style={STYLE} placeholder="SparkLab will be offline on Saturday 10:00–12:00 for an upgrade." />
        </label>
        <label className="text-xs" style={{ color: "var(--muted)" }}>Severity
          <select name="severity" defaultValue="info" className={FIELD} style={STYLE}>
            <option value="info">Info</option><option value="warning">Warning</option><option value="critical">Critical</option>
          </select>
        </label>
        <label className="text-xs" style={{ color: "var(--muted)" }}>From (optional — default now)
          <input type="date" name="start" className={FIELD} style={STYLE} />
        </label>
        <label className="text-xs" style={{ color: "var(--muted)" }}>Until (last day, optional)
          <input type="date" name="end" className={FIELD} style={STYLE} />
        </label>
        <div className="sm:col-span-3">
          <button type="submit" disabled={pending} className="rounded-md px-5 text-sm font-medium disabled:opacity-50"
            style={{ minHeight: 44, background: "var(--foreground)", color: "var(--background)" }}>
            {pending ? "Saving…" : "Publish announcement"}
          </button>
          {state.error && <p role="alert" className="mt-2 text-sm" style={{ color: "var(--critical)" }}>{state.error}</p>}
          {state.ok && !pending && <p role="status" className="mt-2 text-sm" style={{ color: "var(--good)" }}>{state.ok}</p>}
        </div>
      </form>
      <ul className="mt-6 list-none space-y-2 p-0">{rows.map((r) => <AnnRow key={r.id} r={r} />)}</ul>
      {rows.length === 0 && <p className="mt-6 text-sm" style={{ color: "var(--faint)" }}>No announcements.</p>}
    </>
  );
}
