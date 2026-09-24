import { contrastRatio, isValidHex, roundRatio, TEXT_CONTRAST_FLOOR, CONTROL_BORDER_CONTRAST_FLOOR } from "@/lib/contrast";

/**
 * Design Studio (Admin Panel Plan, capability 9). Client-safe and pure: the
 * studio's live preview and the server's publish gate run the same code.
 *
 * Guardrails: no free-form CSS or HTML. Every value is either a strict
 * 6-digit hex or one entry from a fixed list below, and everything reaches
 * the page as CSS custom properties built by designDeclarations().
 */

// ---- Colour tokens ---------------------------------------------------------------

export const COLOR_TOKENS = [
  "primary", "navy", "leaf", "logoBlue", "good", "warning", "critical",
  "canvas", "surface", "text", "border",
] as const;
export type ColorToken = (typeof COLOR_TOKENS)[number];
export type Palette = Record<ColorToken, string>;
export type Mode = "light" | "dark";

export const TOKEN_LABEL: Record<ColorToken, string> = {
  primary: "Primary",
  navy: "Navy (headings)",
  leaf: "Leaf",
  logoBlue: "Logo blue (accent only)",
  good: "Good (status)",
  warning: "Warning (status)",
  critical: "Critical (status)",
  canvas: "Canvas (page background)",
  surface: "Surface (cards, inputs)",
  text: "Text",
  border: "Control border",
};

const CSS_VAR: Record<ColorToken, string> = {
  primary: "--primary", navy: "--navy", leaf: "--leaf", logoBlue: "--logo-blue",
  good: "--good", warning: "--warning", critical: "--critical",
  canvas: "--background", surface: "--surface", text: "--foreground", border: "--control-border",
};

/** Exactly globals.css's hand-tuned values. */
export const DEFAULT_PALETTE: Record<Mode, Palette> = {
  light: {
    primary: "#0f3c76", navy: "#092649", leaf: "#356d1b", logoBlue: "#044176",
    good: "#387047", warning: "#96532b", critical: "#b23b3b",
    canvas: "#e7eef8", surface: "#ffffff", text: "#15263f", border: "#6f8aad",
  },
  dark: {
    primary: "#879eba", navy: "#f0f0f0", leaf: "#9ab68d", logoBlue: "#82a0ba",
    good: "#92b09a", warning: "#c5a08a", critical: "#d59393",
    canvas: "#111111", surface: "#171717", text: "#f0f0f0", border: "#646464",
  },
};

/** globals.css's secondary structural tokens for the default palette. */
const DEFAULT_SECONDARY: Record<Mode, Record<SecondaryToken, string>> = {
  light: { muted: "#5b6779", faint: "#4d5a6d", sunken: "#dde5f1", line: "#e2e8ef", lineSoft: "#f1f3f7", lineStrong: "#bcc8d9" },
  dark: { muted: "#a0a0a0", faint: "#888888", sunken: "#0d0d0d", line: "#2a2a2a", lineSoft: "#212121", lineStrong: "#3a3a3a" },
};
type SecondaryToken = "muted" | "faint" | "sunken" | "line" | "lineSoft" | "lineStrong";
const SECONDARY_VAR: Record<SecondaryToken, string> = {
  muted: "--muted", faint: "--faint", sunken: "--surface-sunken", line: "--line", lineSoft: "--line-soft", lineStrong: "--line-strong",
};

function toRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}
/** sRGB mix, `a` weighted `w` (0..1) -- same as CSS color-mix(in srgb). */
export function mix(a: string, b: string, w: number): string {
  const [ra, ga, ba] = toRgb(a);
  const [rb, gb, bb] = toRgb(b);
  const c = (x: number, y: number) => Math.round(x * w + y * (1 - w)).toString(16).padStart(2, "0");
  return `#${c(ra, rb)}${c(ga, gb)}${c(ba, bb)}`;
}

/**
 * Muted/faint text, sunken surface and hairlines. For the default structure
 * these are globals.css's hand-tuned values; once canvas, surface or text
 * change they are derived from them, so they always move together -- and the
 * gate below checks the derived values too.
 */
export function secondaryTokens(mode: Mode, p: Palette): Record<SecondaryToken, string> {
  const d = DEFAULT_PALETTE[mode];
  if (p.canvas === d.canvas && p.surface === d.surface && p.text === d.text) return DEFAULT_SECONDARY[mode];
  return {
    muted: mix(p.text, p.surface, 0.74),
    faint: mix(p.text, p.surface, 0.8),
    sunken: mix(p.text, p.canvas, 0.06),
    line: mix(p.text, p.surface, 0.1),
    lineSoft: mix(p.text, p.surface, 0.05),
    lineStrong: mix(p.text, p.surface, 0.25),
  };
}

// ---- Shape, type, background ---------------------------------------------------------

export const FONTS = [
  { id: "manrope", label: "Manrope (default)", cssVar: "--font-manrope", note: "Closest free match to Mark Pro. Capital Ə falls back to a system font." },
  { id: "inter", label: "Inter", cssVar: "--font-inter", note: "Neutral, very legible at small sizes." },
  { id: "noto", label: "Noto Sans", cssVar: "--font-noto", note: "Widest language coverage." },
  { id: "plex", label: "IBM Plex Sans", cssVar: "--font-plex", note: "Technical, slightly condensed." },
] as const;
export type FontId = (typeof FONTS)[number]["id"];

export const RADII = [0, 4, 8, 12] as const;
export const BORDERS = [1, 2] as const;
export const CARD_STYLES = ["flat", "outlined", "raised"] as const;
export const DENSITIES = ["comfortable", "compact"] as const;
export const BACKGROUNDS = ["solid", "gradient", "dots"] as const;

export type Design = {
  font: FontId;
  radius: (typeof RADII)[number];
  border: (typeof BORDERS)[number];
  card: (typeof CARD_STYLES)[number];
  density: (typeof DENSITIES)[number];
  background: (typeof BACKGROUNDS)[number];
  accentRule: boolean;
};

export const DEFAULT_DESIGN: Design = {
  font: "manrope", radius: 8, border: 1, card: "outlined", density: "comfortable", background: "solid", accentRule: true,
};

/** A full look: palette for both modes + design. Brand text is separate. */
export type Look = { preset?: string; light: Palette; dark: Palette; design: Design };

export function sanitizeLook(raw: unknown, fallback: Look = DEFAULT_LOOK): Look {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pal = (mode: Mode) => {
    const src = (r[mode] && typeof r[mode] === "object" ? r[mode] : {}) as Record<string, unknown>;
    const out = {} as Palette;
    for (const t of COLOR_TOKENS) {
      const v = typeof src[t] === "string" ? (src[t] as string).trim().toLowerCase() : "";
      out[t] = isValidHex(v) ? v : fallback[mode][t];
    }
    return out;
  };
  const d = (r.design && typeof r.design === "object" ? r.design : {}) as Record<string, unknown>;
  const pick = <T,>(list: readonly T[], v: unknown, dflt: T): T => (list.includes(v as T) ? (v as T) : dflt);
  return {
    preset: typeof r.preset === "string" && r.preset.length <= 40 ? r.preset : undefined,
    light: pal("light"),
    dark: pal("dark"),
    design: {
      font: pick(FONTS.map((f) => f.id), d.font, fallback.design.font),
      radius: pick(RADII, d.radius, fallback.design.radius),
      border: pick(BORDERS, d.border, fallback.design.border),
      card: pick(CARD_STYLES, d.card, fallback.design.card),
      density: pick(DENSITIES, d.density, fallback.design.density),
      background: pick(BACKGROUNDS, d.background, fallback.design.background),
      accentRule: typeof d.accentRule === "boolean" ? d.accentRule : fallback.design.accentRule,
    },
  };
}

export const DEFAULT_LOOK: Look = { preset: "one-simple", light: DEFAULT_PALETTE.light, dark: DEFAULT_PALETTE.dark, design: DEFAULT_DESIGN };

// ---- Presets ---------------------------------------------------------------------------

export const PRESETS: Array<{ id: string; label: string; description: string; look: Look }> = [
  {
    id: "one-simple",
    label: "One.Simple",
    description: "The default: cool canvas, white cards, the blue-to-green accent.",
    look: DEFAULT_LOOK,
  },
  {
    id: "azerconnect-classic",
    label: "Azerconnect Classic",
    description: "Corporate navy and green, crisper corners, flat cards on white.",
    look: {
      preset: "azerconnect-classic",
      light: { ...DEFAULT_PALETTE.light, primary: "#0a3a6b", navy: "#062240", canvas: "#ffffff", surface: "#f4f6f9", text: "#122338", border: "#5f7894" },
      dark: { ...DEFAULT_PALETTE.dark, canvas: "#0b1522", surface: "#122033", text: "#eef2f7", primary: "#8fb0d6", navy: "#eef2f7", border: "#6a7f99" },
      design: { font: "manrope", radius: 4, border: 1, card: "flat", density: "comfortable", background: "solid", accentRule: true },
    },
  },
  {
    id: "high-contrast",
    label: "High Contrast",
    description: "Black on white, thick borders, no decoration — maximum legibility.",
    look: {
      preset: "high-contrast",
      light: {
        primary: "#0b3d91", navy: "#000000", leaf: "#1f5a0e", logoBlue: "#0b3d91", good: "#1d5e2c", warning: "#7a3b00", critical: "#9b1c1c",
        canvas: "#ffffff", surface: "#ffffff", text: "#000000", border: "#000000",
      },
      dark: {
        primary: "#9cc3ff", navy: "#ffffff", leaf: "#a6e08c", logoBlue: "#9cc3ff", good: "#8fe0a5", warning: "#ffc58a", critical: "#ff9e9e",
        canvas: "#000000", surface: "#000000", text: "#ffffff", border: "#ffffff",
      },
      design: { font: "noto", radius: 4, border: 2, card: "outlined", density: "comfortable", background: "solid", accentRule: false },
    },
  },
  {
    id: "midnight",
    label: "Midnight",
    description: "Deep navy surfaces with soft light text, raised cards and a dot grid.",
    look: {
      preset: "midnight",
      light: { ...DEFAULT_PALETTE.light, canvas: "#dde5f1", surface: "#f7f9fc", text: "#101d33", border: "#62789a" },
      dark: {
        primary: "#9db8e6", navy: "#e8eef8", leaf: "#a3c794", logoBlue: "#8aa9d9", good: "#9cc9a8", warning: "#e0b48f", critical: "#f0a0a0",
        canvas: "#0a1628", surface: "#12213a", text: "#e8eef8", border: "#6b82a6",
      },
      design: { font: "inter", radius: 12, border: 1, card: "raised", density: "comfortable", background: "dots", accentRule: true },
    },
  },
];

// ---- The contrast gate --------------------------------------------------------------------

export type GateFailure = { mode: Mode; what: string; against: string; ratio: number; floor: number };

/**
 * Every text-role colour (brand text tokens, text, and the derived
 * muted/faint) must reach 4.5:1 against canvas, surface and the sunken
 * surface; the control border must reach 3:1 against canvas and surface.
 */
export function gate(look: Look): GateFailure[] {
  const out: GateFailure[] = [];
  for (const mode of ["light", "dark"] as const) {
    const p = look[mode];
    const s = secondaryTokens(mode, p);
    const grounds: Array<[string, string]> = [["canvas", p.canvas], ["surface", p.surface], ["sunken surface", s.sunken]];
    // Body text colours also sit on the sunken surface (planned cards);
    // brand and status colours appear on canvas and surface only.
    const texts: Array<[string, string, number]> = [
      ["Text", p.text, 3], ["Muted text (derived)", s.muted, 3], ["Faint text (derived)", s.faint, 3],
      ["Primary", p.primary, 2], ["Navy (headings)", p.navy, 2], ["Leaf", p.leaf, 2],
      ["Good", p.good, 2], ["Warning", p.warning, 2], ["Critical", p.critical, 2],
    ];
    for (const [what, hex, n] of texts) {
      for (const [against, bg] of grounds.slice(0, n)) {
        const r = contrastRatio(hex, bg);
        if (r < TEXT_CONTRAST_FLOOR) out.push({ mode, what, against, ratio: roundRatio(r), floor: TEXT_CONTRAST_FLOOR });
      }
    }
    for (const [against, bg] of grounds.slice(0, 2)) {
      const r = contrastRatio(p.border, bg);
      if (r < CONTROL_BORDER_CONTRAST_FLOOR) out.push({ mode, what: "Control border", against, ratio: roundRatio(r), floor: CONTROL_BORDER_CONTRAST_FLOOR });
    }
  }
  return out;
}

export function describeGate(f: GateFailure[]): string[] {
  return f.map((x) => `${x.what} (${x.mode}) is ${x.ratio}:1 on ${x.against} — needs ${x.floor}:1.`);
}

// ---- CSS ------------------------------------------------------------------------------------

function paletteVars(mode: Mode, p: Palette): Record<string, string> {
  const v: Record<string, string> = {};
  for (const t of COLOR_TOKENS) v[CSS_VAR[t]] = p[t];
  const s = secondaryTokens(mode, p);
  for (const k of Object.keys(s) as SecondaryToken[]) v[SECONDARY_VAR[k]] = s[k];
  return v;
}

/** Shape/type/background variables (mode-independent except the page background). */
function designVars(d: Design): Record<string, string> {
  const font = FONTS.find((f) => f.id === d.font) ?? FONTS[0];
  return {
    "--font-active": `var(${font.cssVar})`,
    "--radius": `${d.radius}px`,
    "--bw": `${d.border}px`,
    "--card-border": d.card === "flat" ? "transparent" : "var(--line)",
    "--card-shadow": d.card === "raised" ? "var(--shadow-md)" : "none",
    "--card-shadow-hover": d.card === "raised" ? "0 6px 18px rgba(0, 0, 0, 0.12)" : "var(--shadow-sm)",
    "--card-pad": d.density === "compact" ? "12px" : "16px",
    "--grid-gap": d.density === "compact" ? "10px" : "16px",
    "--accent-display": d.accentRule ? "block" : "none",
  };
}

export function pageBackground(d: Design): string {
  if (d.background === "gradient") return "linear-gradient(180deg, color-mix(in srgb, var(--primary) 9%, var(--background)) 0, var(--background) 520px)";
  if (d.background === "dots") return "radial-gradient(color-mix(in srgb, var(--foreground) 14%, transparent) 1px, transparent 1.5px) 0 0 / 18px 18px, var(--background)";
  return "var(--background)";
}

/** Inline-style object for a preview container (light or dark). */
export function previewStyle(look: Look, mode: Mode): Record<string, string> {
  return {
    ...paletteVars(mode, look[mode]),
    ...designVars(look.design),
    background: pageBackground(look.design),
    color: "var(--foreground)",
    fontFamily: "var(--font-active), system-ui, sans-serif",
  };
}

const decl = (vars: Record<string, string>) => Object.entries(vars).map(([k, v]) => `${k}:${v};`).join("");

/**
 * The <style> block for the live site. Every value either passed
 * isValidHex (re-checked in sanitizeLook on read) or comes from the fixed
 * lists above, so nothing an admin typed reaches CSS verbatim.
 */
export function lookCss(look: Look): string {
  const safe = sanitizeLook(look);
  return (
    `:root{${decl(paletteVars("light", safe.light))}${decl(designVars(safe.design))}--page-bg:${pageBackground(safe.design)};}` +
    `:root.dark{${decl(paletteVars("dark", safe.dark))}--page-bg:${pageBackground(safe.design)};}`
  );
}
