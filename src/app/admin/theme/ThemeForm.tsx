"use client";

import { useActionState, useMemo, useState } from "react";
import { saveTheme, type ThemeState } from "./actions";
import {
  BRAND_TOKENS,
  STRUCTURAL_SURFACES,
  TEXT_TOKENS,
  type BrandToken,
  type ModeColors,
} from "@/lib/theme-validate";
import { contrastRatio, isValidHex, roundRatio, TEXT_CONTRAST_FLOOR } from "@/lib/contrast";
import type { SiteSettings } from "@/lib/settings";

const FIELD =
  "mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none";
const FIELD_STYLE = {
  borderColor: "var(--control-border)",
  background: "var(--surface)",
  color: "var(--foreground)",
};

const TOKEN_LABEL: Record<BrandToken, string> = {
  primary: "Primary",
  navy: "Navy",
  leaf: "Leaf",
  logoBlue: "Logo blue",
  good: "Good (status)",
  warning: "Warning (status)",
  critical: "Critical (status)",
};

function Field({
  label, name, defaultValue, error, hint, optional,
}: { label: string; name: string; defaultValue?: string; error?: string; hint?: string; optional?: boolean }) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">{label}</label>
      {hint && <p className="text-xs" style={{ color: "var(--faint)" }}>{hint}</p>}
      <input
        id={name} name={name} defaultValue={defaultValue} required={!optional}
        className={FIELD} style={FIELD_STYLE}
        aria-invalid={error ? true : undefined}
      />
      {error && (
        <p role="alert" className="mt-1 text-xs" style={{ color: "var(--critical)" }}>{error}</p>
      )}
    </div>
  );
}

/** One token: a native colour picker paired with a text hex field, kept in
 *  sync -- the picker is faster to use, the text field is what actually
 *  gets validated and is pasteable. A live ratio badge shows this token's
 *  contrast against both structural surfaces as the admin types, computed
 *  with the exact same function the server re-checks on submit. */
function TokenInput({
  mode, token, value, onChange,
}: {
  mode: "light" | "dark"; token: BrandToken; value: string; onChange: (v: string) => void;
}) {
  const valid = isValidHex(value);
  const gated = TEXT_TOKENS.includes(token);
  const surfaces = STRUCTURAL_SURFACES[mode];
  const ratios = valid
    ? {
        surface: roundRatio(contrastRatio(value, surfaces.surface)),
        background: roundRatio(contrastRatio(value, surfaces.background)),
      }
    : null;
  const failing = ratios ? ratios.surface < TEXT_CONTRAST_FLOOR || ratios.background < TEXT_CONTRAST_FLOOR : false;

  return (
    <div>
      <label htmlFor={`${mode}.${token}`} className="block text-xs font-medium">
        {TOKEN_LABEL[token]}
      </label>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="color"
          aria-label={`${TOKEN_LABEL[token]} (${mode}) picker`}
          value={valid ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-9 shrink-0 cursor-pointer rounded border p-0"
          style={{ borderColor: "var(--control-border)" }}
        />
        <input
          id={`${mode}.${token}`}
          name={`${mode}.${token}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border px-2 py-1.5 text-xs font-mono outline-none"
          style={FIELD_STYLE}
          aria-invalid={!valid || failing ? true : undefined}
        />
      </div>
      {!valid && (
        <p className="mt-1 text-xs" style={{ color: "var(--critical)" }}>Not a 6-digit hex colour.</p>
      )}
      {valid && gated && (
        <p className="mt-1 text-xs" style={{ color: failing ? "var(--critical)" : "var(--faint)" }}>
          {ratios!.surface}:1 on paper · {ratios!.background}:1 on canvas
          {failing ? ` — needs ${TEXT_CONTRAST_FLOOR}:1` : ""}
        </p>
      )}
      {valid && !gated && (
        <p className="mt-1 text-xs" style={{ color: "var(--faint)" }}>Gradient only — not text-gated.</p>
      )}
    </div>
  );
}

export function ThemeForm({ settings }: { settings: SiteSettings }) {
  const [state, action, pending] = useActionState<ThemeState, FormData>(saveTheme, {});
  const [light, setLight] = useState<ModeColors>(settings.colors.light);
  const [dark, setDark] = useState<ModeColors>(settings.colors.dark);
  const e = state.fieldErrors ?? {};

  const liveFailureCount = useMemo(() => {
    let n = 0;
    for (const [mode, colors] of [["light", light], ["dark", dark]] as const) {
      const surfaces = STRUCTURAL_SURFACES[mode];
      for (const token of TEXT_TOKENS) {
        if (!isValidHex(colors[token])) continue;
        if (contrastRatio(colors[token], surfaces.surface) < TEXT_CONTRAST_FLOOR) n++;
        if (contrastRatio(colors[token], surfaces.background) < TEXT_CONTRAST_FLOOR) n++;
      }
    }
    return n;
  }, [light, dark]);

  return (
    <form action={action} className="mt-8 space-y-8">
      {state.error && (
        <div
          role="alert"
          className="rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: "var(--critical)", color: "var(--critical)" }}
        >
          <p>{state.error}</p>
          {state.contrastFailures && state.contrastFailures.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs">
              {state.contrastFailures.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {state.ok && (
        <p
          role="status"
          className="rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: "var(--good)", color: "var(--good)" }}
        >
          Saved. The public site picks up the change within seconds.
        </p>
      )}
      {liveFailureCount > 0 && (
        <p className="text-xs" style={{ color: "var(--warning)" }}>
          {liveFailureCount} colour{liveFailureCount === 1 ? "" : "s"} below the {TEXT_CONTRAST_FLOOR}:1
          contrast floor right now — see the token{liveFailureCount === 1 ? "" : "s"} below. Saving is
          refused until every one clears it.
        </p>
      )}

      <div className="space-y-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--faint)" }}>
          Identity
        </h2>
        <Field label="Brand name" name="brandName" defaultValue={settings.brandName} error={e.brandName} />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Wordmark, first half" name="wordmarkPrimary" defaultValue={settings.wordmarkPrimary} error={e.wordmarkPrimary} />
          <Field label="Wordmark, second half" name="wordmarkSecondary" defaultValue={settings.wordmarkSecondary} error={e.wordmarkSecondary} />
        </div>
        <Field label="Attribution" name="attribution" defaultValue={settings.attribution} error={e.attribution}
          hint="Shown beneath the wordmark. Leave it in place to credit Azerconnect, or blank it out." />
        <Field label="Tagline (English)" name="tagline" defaultValue={settings.tagline} error={e.tagline} />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Tagline (Azərbaycanca)" name="tagline_az"
            defaultValue={settings.taglineI18n.az?.tagline ?? ""} error={e.taglineAz}
            hint="Blank falls back to English." optional />
          <Field label="Tagline (Русский)" name="tagline_ru"
            defaultValue={settings.taglineI18n.ru?.tagline ?? ""} error={e.taglineRu}
            hint="Blank falls back to English." optional />
        </div>

        <div>
          <label htmlFor="logo" className="block text-sm font-medium">Logo</label>
          <p className="text-xs" style={{ color: "var(--faint)" }}>
            PNG, JPEG or WebP, up to 512 KB. SVG is not accepted. Leave empty to keep the current logo.
          </p>
          {settings.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.logoUrl} alt="Current logo" className="mt-2 h-10 w-auto" />
          )}
          <input
            id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp"
            className="mt-2 block text-sm"
          />
          {e.logo && (
            <p role="alert" className="mt-1 text-xs" style={{ color: "var(--critical)" }}>{e.logo}</p>
          )}
        </div>
      </div>

      {(["light", "dark"] as const).map((mode) => {
        const colors = mode === "light" ? light : dark;
        const setColors = mode === "light" ? setLight : setDark;
        return (
          <div key={mode} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--faint)" }}>
              {mode === "light" ? "Colours — light" : "Colours — dark"}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {BRAND_TOKENS.map((token) => (
                <TokenInput
                  key={token}
                  mode={mode}
                  token={token}
                  value={colors[token]}
                  onChange={(v) => setColors({ ...colors, [token]: v })}
                />
              ))}
            </div>
          </div>
        );
      })}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
        style={{ background: "var(--foreground)", color: "var(--background)", minHeight: 44 }}
      >
        {pending ? "Saving…" : "Save theme"}
      </button>
    </form>
  );
}
