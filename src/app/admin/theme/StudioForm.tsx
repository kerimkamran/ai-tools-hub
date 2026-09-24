"use client";

import { useState } from "react";
import { useKeepAction } from "@/components/admin/useKeepAction";
import { isValidHex } from "@/lib/contrast";
import {
  BACKGROUNDS, BORDERS, CARD_STYLES, COLOR_TOKENS, DENSITIES, FONTS, RADII, TOKEN_LABEL,
  describeGate, gate, previewStyle, type Look, type Mode, type Palette,
} from "@/lib/design";
import type { Brand } from "@/lib/theme-validate";
import { saveDraft, type StudioState } from "./actions";

const FIELD = "mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none";
const FIELD_STYLE = { borderColor: "var(--control-border)", background: "var(--surface)", color: "var(--foreground)" };

function Text({ label, name, value, error, optional, lang }: { label: string; name: string; value: string; error?: string; optional?: boolean; lang?: string }) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">{label}</label>
      <input id={name} name={name} defaultValue={value} required={!optional} lang={lang} className={FIELD} style={FIELD_STYLE} aria-invalid={error ? true : undefined} />
      {error && <p role="alert" className="mt-1 text-xs" style={{ color: "var(--critical)" }}>{error}</p>}
    </div>
  );
}

function Choice<T extends string | number>({ label, name, value, options, labels }: { label: string; name: string; value: T; options: readonly T[]; labels?: Partial<Record<string, string>> }) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{label}</legend>
      <div className="mt-1 flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={String(o)} className="flex cursor-pointer items-center gap-2 rounded-md border px-3 text-sm" style={{ minHeight: 44, borderColor: "var(--control-border)" }}>
            <input type="radio" name={name} value={String(o)} defaultChecked={o === value} /> {labels?.[String(o)] ?? String(o)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function StudioForm({ brand, look }: { brand: Brand; look: Look }) {
  const [state, onSubmit, pending] = useKeepAction<StudioState>(saveDraft, {});
  const [palette, setPalette] = useState<Record<Mode, Palette>>({ light: look.light, dark: look.dark });
  const [design, setDesign] = useState(look.design);
  const e = state.fieldErrors ?? {};

  const current: Look = { ...look, light: palette.light, dark: palette.dark, design };
  const allValid = COLOR_TOKENS.every((t) => isValidHex(palette.light[t]) && isValidHex(palette.dark[t]));
  const failures = allValid ? describeGate(gate(current)) : [];

  const setToken = (mode: Mode, t: (typeof COLOR_TOKENS)[number], v: string) =>
    setPalette((p) => ({ ...p, [mode]: { ...p[mode], [t]: v } }));

  return (
    <form
      onSubmit={onSubmit}
      onChange={(ev) => {
        const f = ev.currentTarget;
        const fd = new FormData(f);
        setDesign({
          font: String(fd.get("font")) as Look["design"]["font"],
          radius: Number(fd.get("radius")) as Look["design"]["radius"],
          border: Number(fd.get("border")) as Look["design"]["border"],
          card: String(fd.get("card")) as Look["design"]["card"],
          density: String(fd.get("density")) as Look["design"]["density"],
          background: String(fd.get("background")) as Look["design"]["background"],
          accentRule: fd.get("accentRule") === "on",
        });
      }}
      className="mt-8 space-y-10"
    >
      <input type="hidden" name="preset" value={look.preset ?? ""} />
      {state.error && <p role="alert" className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: "var(--critical)", color: "var(--critical)" }}>{state.error}</p>}
      {state.ok && !pending && <p role="status" className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: "var(--good)", color: "var(--good)" }}>{state.ok}</p>}

      <section className="space-y-4">
        <h2 className="text-base font-semibold">Brand</h2>
        <Text label="Brand name" name="brandName" value={brand.brandName} error={e.brandName} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Text label="Wordmark, first part" name="wordmarkPrimary" value={brand.wordmarkPrimary} error={e.wordmarkPrimary} />
          <Text label="Wordmark, second part (green)" name="wordmarkSecondary" value={brand.wordmarkSecondary} error={e.wordmarkSecondary} />
        </div>
        <Text label="Attribution" name="attribution" value={brand.attribution} optional />
        <Text label="Tagline (English)" name="tagline" value={brand.tagline} error={e.tagline} />
        <p className="text-xs" style={{ color: "var(--muted)" }}>The tagline is translated into Azərbaycanca and Русский automatically when you publish.</p>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold">Colour</h2>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Muted text and hairlines are derived from canvas, surface and text, and checked too.
        </p>
        <div className="grid gap-6 md:grid-cols-2">
          {(["light", "dark"] as const).map((mode) => (
            <fieldset key={mode} className="space-y-2 rounded-lg border p-4" style={{ borderColor: "var(--line)" }}>
              <legend className="px-1 text-sm font-medium">{mode === "light" ? "Light mode" : "Dark mode"}</legend>
              {COLOR_TOKENS.map((t) => {
                const name = `${mode}.${t}`;
                const v = palette[mode][t];
                return (
                  <div key={t} className="flex items-center gap-2">
                    <input type="color" aria-label={`${TOKEN_LABEL[t]} (${mode}) picker`} value={isValidHex(v) ? v : "#000000"}
                      onChange={(ev) => setToken(mode, t, ev.target.value)} className="h-9 w-11 shrink-0 cursor-pointer rounded border" style={{ borderColor: "var(--control-border)" }} />
                    <label htmlFor={name} className="min-w-0 flex-1 text-xs">{TOKEN_LABEL[t]}</label>
                    <input id={name} name={name} value={v} onChange={(ev) => setToken(mode, t, ev.target.value.trim())} maxLength={7} spellCheck={false}
                      className="w-24 rounded-md border px-2 py-1.5 font-mono text-xs" style={{ ...FIELD_STYLE, borderColor: e[name] || !isValidHex(v) ? "var(--critical)" : "var(--control-border)" }} />
                  </div>
                );
              })}
            </fieldset>
          ))}
        </div>
        <div role="status" aria-live="polite" className="rounded-md border px-3 py-2 text-xs" style={{ borderColor: failures.length ? "var(--critical)" : "var(--good)" }}>
          {!allValid ? (
            <span style={{ color: "var(--critical)" }}>Some colours are not valid 6-digit hex codes.</span>
          ) : failures.length ? (
            <>
              <p className="font-medium" style={{ color: "var(--critical)" }}>Contrast gate: {failures.length} problem{failures.length === 1 ? "" : "s"} — this cannot be published yet.</p>
              <ul className="mt-1 list-disc pl-5" style={{ color: "var(--critical)" }}>{failures.slice(0, 8).map((f) => <li key={f}>{f}</li>)}</ul>
            </>
          ) : (
            <span style={{ color: "var(--good)" }}>Contrast gate: every colour passes (4.5:1 text, 3:1 control borders).</span>
          )}
        </div>
      </section>

      <section className="space-y-5">
        <h2 className="text-base font-semibold">Type, shape and background</h2>
        <fieldset>
          <legend className="text-sm font-medium">Font</legend>
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            {FONTS.map((f) => (
              <label key={f.id} className="flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm" style={{ borderColor: "var(--control-border)" }}>
                <input type="radio" name="font" value={f.id} defaultChecked={design.font === f.id} className="mt-1" />
                <span>
                  <span style={{ fontFamily: `var(${f.cssVar})` }} className="block text-base">{f.label} — Əə Ğğ Iı Şş Çç Öö Üü · Жж Щщ</span>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>{f.note}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <Choice label="Corner radius" name="radius" value={design.radius} options={RADII} labels={{ 0: "0 px", 4: "4 px", 8: "8 px", 12: "12 px" }} />
        <Choice label="Border weight" name="border" value={design.border} options={BORDERS} labels={{ 1: "1 px", 2: "2 px" }} />
        <Choice label="Cards" name="card" value={design.card} options={CARD_STYLES} labels={{ flat: "Flat", outlined: "Outlined", raised: "Raised" }} />
        <Choice label="Spacing" name="density" value={design.density} options={DENSITIES} labels={{ comfortable: "Comfortable", compact: "Compact" }} />
        <Choice label="Background" name="background" value={design.background} options={BACKGROUNDS} labels={{ solid: "Solid", gradient: "Soft brand gradient", dots: "Subtle dot grid" }} />
        <label className="flex items-center gap-3 text-sm" style={{ minHeight: 44 }}>
          <input type="checkbox" name="accentRule" defaultChecked={design.accentRule} className="h-5 w-5" /> Show the blue-to-green accent rule under the header
        </label>
      </section>

      <section>
        <h2 className="text-base font-semibold">Quick look</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(["light", "dark"] as const).map((mode) => (
            <div key={mode} className="rounded-lg p-4" style={previewStyle(current, mode)} aria-label={`${mode} quick look`}>
              <div style={{ height: 3, background: "linear-gradient(90deg, var(--logo-blue), var(--leaf))", display: "var(--accent-display)" }} />
              <p className="mt-3 text-lg font-semibold" style={{ color: "var(--navy)" }}>{mode === "light" ? "Light" : "Dark"}</p>
              <div data-card className="mt-2 border" style={{ borderRadius: "var(--radius)", borderWidth: "var(--bw)", borderColor: "var(--card-border)", padding: "var(--card-pad)", background: "var(--surface)" }}>
                <p className="font-semibold">SparkLab</p>
                <p className="text-sm" style={{ color: "var(--muted)" }}>Capture ideas and move the good ones forward.</p>
                <p className="mt-1 text-xs" style={{ color: "var(--primary)" }}>Open tool →</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <button type="submit" disabled={pending} className="rounded-md px-5 text-sm font-medium disabled:opacity-50"
        style={{ minHeight: 44, background: "var(--foreground)", color: "var(--background)" }}>
        {pending ? "Saving…" : "Save draft"}
      </button>
      {state.warnings && state.warnings.length > 0 && !pending && (
        <ul className="list-disc pl-5 text-xs" style={{ color: "var(--critical)" }}>{state.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
      )}
    </form>
  );
}
