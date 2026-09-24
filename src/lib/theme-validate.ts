import { z } from "zod";
import {
  contrastRatio,
  isValidHex,
  roundRatio,
  TEXT_CONTRAST_FLOOR,
} from "@/lib/contrast";

/**
 * The theme editor's two mandatory controls (One.Simple plan, "Theme editor"
 * section): no free-form CSS -- only these token names, only strict 6-digit
 * hex -- and a live contrast gate that refuses to save a palette that would
 * regress accessibility. Both live here so the Server Action in
 * src/app/admin/theme/actions.ts cannot save without going through them.
 */

/** The fixed token allowlist. Exactly the brand-role tokens Phase A
 *  introduced -- see the scope note in 0004_site_settings.sql. Anything not
 *  in this list is rejected by the zod schema below; there is no path from
 *  form input to an arbitrary CSS variable name. */
export const BRAND_TOKENS = [
  "primary",
  "navy",
  "leaf",
  "logoBlue",
  "good",
  "warning",
  "critical",
] as const;
export type BrandToken = (typeof BRAND_TOKENS)[number];

/** Tokens actually rendered as text (or a status word) on a surface, and so
 *  subject to the 4.5:1 gate. logoBlue is excluded on purpose -- Phase A's
 *  source comment is explicit that it is "used only in the accent gradient,
 *  never used alone", so it never needs to be legible as text. Exported so
 *  the theme editor's client-side live preview (ThemeForm.tsx) can run the
 *  identical check as the admin types, before the server re-checks it
 *  authoritatively on submit. */
export const TEXT_TOKENS: readonly BrandToken[] = [
  "primary",
  "navy",
  "leaf",
  "good",
  "warning",
  "critical",
];

/**
 * Structural surfaces the editable tokens are checked against. These are
 * NOT admin-editable (see the site_settings migration) and are duplicated
 * from src/app/globals.css on purpose -- if that file's --surface or
 * --background ever changes, this constant must change with it, which is
 * why both are called out together rather than one being computed from the
 * other.
 */
export const STRUCTURAL_SURFACES = {
  light: { surface: "#ffffff", background: "#e7eef8" },
  dark: { surface: "#171717", background: "#111111" },
} as const;

const hexField = z
  .string()
  .trim()
  .refine(isValidHex, { message: "Must be a 6-digit hex colour, e.g. #0f3c76." });

const modeColors = z.object({
  primary: hexField,
  navy: hexField,
  leaf: hexField,
  logoBlue: hexField,
  good: hexField,
  warning: hexField,
  critical: hexField,
});
export type ModeColors = z.infer<typeof modeColors>;

export const themeInputSchema = z.object({
  brandName: z.string().trim().min(1).max(60),
  wordmarkPrimary: z.string().trim().min(1).max(20),
  wordmarkSecondary: z.string().trim().min(1).max(20),
  attribution: z.string().trim().max(60).default(""),
  tagline: z.string().trim().min(1).max(120),
  // Optional per-locale taglines (Phase C). Blank = fall back to English.
  taglineAz: z.string().trim().max(120).default(""),
  taglineRu: z.string().trim().max(120).default(""),
  light: modeColors,
  dark: modeColors,
});
export type ThemeInput = z.infer<typeof themeInputSchema>;

export type ContrastFailure = {
  mode: "light" | "dark";
  token: BrandToken;
  against: "surface" | "background";
  ratio: number;
};

/**
 * The contrast gate. Checks every text-role token against both structural
 * surfaces, in both modes -- 6 tokens x 2 surfaces x 2 modes = 24 checks.
 * Returns every failure, not just the first, so the admin sees the whole
 * picture in one submit rather than fixing one token at a time.
 */
export function findContrastFailures(input: {
  light: ModeColors;
  dark: ModeColors;
}): ContrastFailure[] {
  const failures: ContrastFailure[] = [];

  for (const mode of ["light", "dark"] as const) {
    const colors = input[mode];
    const surfaces = STRUCTURAL_SURFACES[mode];
    for (const token of TEXT_TOKENS) {
      const hex = colors[token];
      for (const against of ["surface", "background"] as const) {
        const ratio = contrastRatio(hex, surfaces[against]);
        if (ratio < TEXT_CONTRAST_FLOOR) {
          failures.push({ mode, token, against, ratio: roundRatio(ratio) });
        }
      }
    }
  }

  return failures;
}

const TOKEN_LABEL: Record<BrandToken, string> = {
  primary: "Primary",
  navy: "Navy",
  leaf: "Leaf",
  logoBlue: "Logo blue",
  good: "Good (status)",
  warning: "Warning (status)",
  critical: "Critical (status)",
};

/** One human-readable line per failure, for the form's error summary. */
export function describeContrastFailures(failures: ContrastFailure[]): string[] {
  return failures.map(
    (f) =>
      `${TOKEN_LABEL[f.token]} (${f.mode}) is only ${f.ratio}:1 against ${f.against} -- needs ${TEXT_CONTRAST_FLOOR}:1.`
  );
}

/** Shape the theme editor writes into site_settings.colors. */
export function toColorsColumn(input: {
  light: ModeColors;
  dark: ModeColors;
}): Record<"light" | "dark", ModeColors> {
  return { light: input.light, dark: input.dark };
}
