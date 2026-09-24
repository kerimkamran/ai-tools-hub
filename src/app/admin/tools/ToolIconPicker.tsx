"use client";

import { useState } from "react";
import type { Tool } from "@/lib/types";
import { TOOL_ICONS } from "@/lib/tool-icons";

/**
 * Tool branding: pick a glyph from the curated set (or type any single
 * emoji/character), and optionally upload the tool's own logo, which then
 * replaces the glyph everywhere. PNG/JPEG/WebP up to 128 KB; SVG refused.
 */
export function ToolIconPicker({ tool, error }: { tool: Tool | null; error?: string }) {
  const [icon, setIcon] = useState(tool?.icon ?? "✦");
  const [preview, setPreview] = useState<string | null>(null);
  const [remove, setRemove] = useState(false);
  const current = remove ? null : preview ?? (tool?.hasIconImage ? `/admin/tools/${tool.id}/icon?v=${tool.iconVersion}` : null);

  return (
    <fieldset className="space-y-3 rounded-lg border p-4" style={{ borderColor: "var(--line)" }}>
      <legend className="px-1 text-sm font-medium">Icon & logo</legend>
      <div className="flex items-center gap-3">
        <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border text-3xl" style={{ borderColor: "var(--line)", background: "var(--surface)" }} aria-label="Current icon">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {current ? <img src={current} alt="" className="h-full w-full object-contain" /> : <span aria-hidden="true">{icon}</span>}
        </span>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          {current ? "The uploaded logo is shown on cards and the tool page." : "The glyph below is shown. Upload a logo to use the tool's own branding instead."}
        </p>
      </div>

      <input type="hidden" name="icon" value={icon} />
      <div role="radiogroup" aria-label="Icon" className="grid grid-cols-8 gap-1 sm:grid-cols-11">
        {TOOL_ICONS.map((i) => (
          <button key={i.glyph} type="button" role="radio" aria-checked={icon === i.glyph} aria-label={i.label} title={i.label}
            onClick={() => setIcon(i.glyph)}
            className="flex items-center justify-center rounded-md border text-xl"
            style={{ minWidth: 44, minHeight: 44, borderColor: icon === i.glyph ? "var(--foreground)" : "var(--line)", background: icon === i.glyph ? "var(--surface-sunken)" : "transparent" }}>
            <span aria-hidden="true">{i.glyph}</span>
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
        Or type one:
        <input value={icon} onChange={(e) => setIcon(e.target.value.slice(0, 8))} maxLength={8} aria-label="Custom icon character"
          className="w-16 rounded-md border px-2 py-1 text-center text-lg" style={{ borderColor: "var(--control-border)", background: "var(--surface)" }} />
      </label>

      <div>
        <label htmlFor="iconImage" className="block text-sm">Logo image (optional)</label>
        <p className="text-xs" style={{ color: "var(--faint)" }}>PNG, JPEG or WebP, up to 128 KB, ideally square. SVG is not accepted.</p>
        <input id="iconImage" name="iconImage" type="file" accept="image/png,image/jpeg,image/webp" className="mt-1 block text-sm"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setRemove(false);
            setPreview(f ? URL.createObjectURL(f) : null);
          }} />
        {error && <p role="alert" className="mt-1 text-xs" style={{ color: "var(--critical)" }}>{error}</p>}
        {tool?.hasIconImage && (
          <label className="mt-2 flex items-center gap-2 text-sm" style={{ minHeight: 44 }}>
            <input type="checkbox" name="removeIconImage" checked={remove} onChange={(e) => setRemove(e.target.checked)} /> Remove the logo (use the glyph)
          </label>
        )}
      </div>
    </fieldset>
  );
}
