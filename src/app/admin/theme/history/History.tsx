"use client";

import { useActionState, useTransition } from "react";
import { ActionMenu } from "@/components/admin/ActionMenu";
import { useKeepAction } from "@/components/admin/useKeepAction";
import { addSchedule, deleteSchedule, rollbackTheme, type StudioState } from "../actions";

type Version = { id: number; publishedAt: string; publishedBy: string | null; note: string | null; current: boolean; swatch: string[] };
type Schedule = { id: number; name: string; startsAt: string; endsAt: string; active: boolean; createdBy: string | null };

const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Baku" });
const FIELD = "mt-1 block rounded-md border px-3 text-sm";
const STYLE = { minHeight: 44, borderColor: "var(--control-border)", background: "var(--surface)", color: "var(--foreground)" };

export function History({ versions, schedules, sources }: { versions: Version[]; schedules: Schedule[]; sources: Array<{ value: string; label: string }> }) {
  const [rb, rbDispatch] = useActionState<StudioState, FormData>(rollbackTheme, {});
  const [del, delDispatch] = useActionState<StudioState, FormData>(deleteSchedule, {});
  const [add, onAdd, adding] = useKeepAction<StudioState>(addSchedule, {});
  const [pending, start] = useTransition();
  const msg = (s: StudioState) => (
    <>
      {s.error && <p role="alert" className="mt-2 text-sm" style={{ color: "var(--critical)" }}>{s.error}</p>}
      {s.warnings && <ul className="list-disc pl-5 text-xs" style={{ color: "var(--critical)" }}>{s.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      {s.ok && !pending && <p role="status" className="mt-2 text-sm" style={{ color: "var(--good)" }}>{s.ok}</p>}
    </>
  );

  return (
    <>
      <section className="mt-8">
        <h2 className="text-base font-semibold">Published versions</h2>
        {msg(rb)}
        <ul className="mt-3 list-none space-y-2 p-0">
          {versions.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-3 rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex shrink-0 overflow-hidden rounded" aria-hidden="true">
                  {v.swatch.map((c, i) => <span key={i} style={{ width: 10, height: 24, background: c }} />)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    #{v.id} · {v.note ?? "Published"}
                    {v.current && <span className="ml-2 text-xs" style={{ color: "var(--good)" }}>live</span>}
                  </p>
                  <p className="text-xs" style={{ color: "var(--faint)" }}>{fmt(v.publishedAt)} (Baku) · {v.publishedBy ?? "—"}</p>
                </div>
              </div>
              {!v.current && (
                <button type="button" disabled={pending}
                  onClick={() => { const fd = new FormData(); fd.set("versionId", String(v.id)); start(() => rbDispatch(fd)); }}
                  className="shrink-0 rounded-md border px-4 text-sm disabled:opacity-50" style={{ minHeight: 44, borderColor: "var(--control-border)" }}>
                  Roll back to this
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-base font-semibold">Scheduled themes</h2>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          A scheduled look replaces the published colours, type and shape on every public page between the dates (whole days, Baku time),
          then the published theme returns by itself. Brand text is not changed.
        </p>
        {msg(del)}
        <ul className="mt-3 list-none space-y-2 p-0">
          {schedules.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 rounded-lg border p-3" style={{ borderColor: s.active ? "var(--good)" : "var(--line)" }}>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{s.name}{s.active && <span className="ml-2 text-xs" style={{ color: "var(--good)" }}>active now</span>}</p>
                <p className="text-xs" style={{ color: "var(--faint)" }}>{fmt(s.startsAt)} → {fmt(s.endsAt)} · {s.createdBy ?? "—"}</p>
              </div>
              <ActionMenu label={`Actions for schedule ${s.name}`} items={[{
                label: "Delete", destructive: true, confirm: { prompt: `Type ${s.name} to delete this schedule`, expected: s.name },
                onSelect: () => { const fd = new FormData(); fd.set("id", String(s.id)); start(() => delDispatch(fd)); },
              }]} />
            </li>
          ))}
        </ul>
        {schedules.length === 0 && <p className="mt-2 text-sm" style={{ color: "var(--faint)" }}>Nothing scheduled.</p>}

        <form onSubmit={onAdd} className="mt-4 grid gap-3 rounded-lg border p-4 sm:grid-cols-2" style={{ borderColor: "var(--line)" }}>
          <label className="text-xs" style={{ color: "var(--muted)" }}>Name
            <input name="name" required maxLength={60} placeholder="Novruz" className={`${FIELD} w-full`} style={STYLE} />
          </label>
          <label className="text-xs" style={{ color: "var(--muted)" }}>Show
            <select name="source" className={`${FIELD} w-full`} style={STYLE}>{sources.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
          </label>
          <label className="text-xs" style={{ color: "var(--muted)" }}>From (first day)
            <input type="date" name="start" required className={`${FIELD} w-full`} style={STYLE} />
          </label>
          <label className="text-xs" style={{ color: "var(--muted)" }}>Until (last day)
            <input type="date" name="end" required className={`${FIELD} w-full`} style={STYLE} />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" disabled={adding} className="rounded-md border px-4 text-sm disabled:opacity-50" style={{ minHeight: 44, borderColor: "var(--control-border)" }}>
              {adding ? "Scheduling…" : "+ Schedule"}
            </button>
            {msg(add)}
          </div>
        </form>
      </section>
    </>
  );
}
