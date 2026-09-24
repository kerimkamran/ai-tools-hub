"use client";

import { useActionState, useTransition } from "react";
import { useKeepAction } from "@/components/admin/useKeepAction";
import { applyPreset, saveLogo, type StudioState } from "./actions";

type Preset = { id: string; label: string; description: string; swatch: string[] };

export function PresetPicker({ presets, current }: { presets: Preset[]; current?: string }) {
  const [state, dispatch] = useActionState<StudioState, FormData>(applyPreset, {});
  const [pending, start] = useTransition();
  return (
    <section>
      <h2 className="text-base font-semibold">Presets</h2>
      <p className="text-xs" style={{ color: "var(--muted)" }}>Loads a preset into the draft (brand text is kept). The live site does not change.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {presets.map((p) => (
          <button key={p.id} type="button" disabled={pending}
            onClick={() => { const fd = new FormData(); fd.set("preset", p.id); start(() => dispatch(fd)); }}
            className="flex items-start gap-3 rounded-lg border p-3 text-left disabled:opacity-50"
            style={{ minHeight: 44, borderColor: current === p.id ? "var(--foreground)" : "var(--control-border)" }}
            aria-pressed={current === p.id}>
            <span className="mt-0.5 flex shrink-0 overflow-hidden rounded" aria-hidden="true">
              {p.swatch.map((c, i) => <span key={i} style={{ width: 12, height: 28, background: c }} />)}
            </span>
            <span>
              <span className="block text-sm font-medium">{p.label}</span>
              <span className="block text-xs" style={{ color: "var(--muted)" }}>{p.description}</span>
            </span>
          </button>
        ))}
      </div>
      {state.error && <p role="alert" className="mt-2 text-xs" style={{ color: "var(--critical)" }}>{state.error}</p>}
      {state.ok && !pending && <p role="status" className="mt-2 text-xs" style={{ color: "var(--good)" }}>{state.ok}</p>}
    </section>
  );
}

export function LogoForm({ hasLogo }: { hasLogo: boolean }) {
  const [state, onSubmit, pending] = useKeepAction<StudioState>(saveLogo, {});
  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border p-4" style={{ borderColor: "var(--line)" }} encType="multipart/form-data">
      <h2 className="text-base font-semibold">Logo & favicon</h2>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        PNG, JPEG or WebP up to 512 KB (SVG is refused). Saved immediately, not part of the draft; the favicon is made from it.
        {hasLogo ? " A logo is set." : " No logo yet — the wordmark is used."}
      </p>
      <input type="file" name="logo" accept="image/png,image/jpeg,image/webp" className="block text-sm" />
      {hasLogo && (
        <label className="flex items-center gap-2 text-sm" style={{ minHeight: 44 }}>
          <input type="checkbox" name="remove" /> Remove the logo
        </label>
      )}
      {state.error && <p role="alert" className="text-xs" style={{ color: "var(--critical)" }}>{state.error}</p>}
      {state.ok && !pending && <p role="status" className="text-xs" style={{ color: "var(--good)" }}>{state.ok}</p>}
      <button type="submit" disabled={pending} className="rounded-md border px-4 text-sm disabled:opacity-50" style={{ minHeight: 44, borderColor: "var(--control-border)" }}>
        {pending ? "Saving…" : "Save logo"}
      </button>
    </form>
  );
}
