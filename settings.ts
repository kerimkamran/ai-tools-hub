import "server-only";
import { cache } from "react";
import { createPublicClient, hasSupabaseConfig } from "@/lib/supabase/server";
import { isValidHex } from "@/lib/contrast";
import type { BrandToken, ModeColors } from "@/lib/theme-validate";
import { strings } from "@/lib/strings";

/**
 * THE SEAM for site branding, same pattern as src/lib/registry.ts for tools:
 * every read of the live theme goes through this module, so the root layout
 * (and anything else that ever needs it) does not know or care where the
 * settings row lives.
 *
 * Uses the anon, cookie-free client -- never createAuthClient() -- for the
 * same reason the public catalog does: the root layout renders for every
 * route, so touching cookies here would opt the whole app into dynamic
 * rendering and destroy the catalog's static delivery. A save in the theme
 * editor calls revalidatePath("/", "layout") instead, which busts the ISR
 * snapshot everywhere this module is read from.
 */

export type SiteSettings = {
  brandName: string;
  wordmarkPrimary: string;
  wordmarkSecondary: string;
  attribution: string;
  tagline: string;
  logoUrl: string | null;
  colors: { light: ModeColors; dark: ModeColors };
};

/**
 * Exactly what Phase A shipped in globals.css and the 0004 migration seeds
 * -- so an unconfigured or unreachable Supabase project renders identically
 * to today, the same fallback discipline src/lib/registry.ts uses for tools.
 */
export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  brandName: strings.brand,
  wordmarkPrimary: "one",
  wordmarkSecondary: ".simple",
  attribution: "by Azerconnect Group",
  tagline: strings.tagline,
  logoUrl: null,
  colors: {
    light: {
      primary: "#0f3c76",
      navy: "#092649",
      leaf: "#356d1b",
      logoBlue: "#044176",
      good: "#387047",
      warning: "#96532b",
      critical: "#b23b3b",
    },
    dark: {
      primary: "#879eba",
      navy: "#f0f0f0",
      leaf: "#9ab68d",
      logoBlue: "#82a0ba",
      good: "#92b09a",
      warning: "#c5a08a",
      critical: "#d59393",
    },
  },
};

type SettingsRow = {
  brand_name: string;
  wordmark_primary: string;
  wordmark_secondary: string;
  attribution: string;
  tagline: string;
  logo_url: string | null;
  colors: unknown;
};

function rowToSettings(row: SettingsRow): SiteSettings {
  const colors = row.colors as { light?: ModeColors; dark?: ModeColors } | null;
  return {
    brandName: row.brand_name,
    wordmarkPrimary: row.wordmark_primary,
    wordmarkSecondary: row.wordmark_secondary,
    attribution: row.attribution,
    tagline: row.tagline,
    logoUrl: row.logo_url,
    // A malformed or partial colors blob (should not happen -- writes are
    // gated by theme-validate.ts -- but this is a READ path with a public
    // fallback, so it gets the same defence the SSRF validator applies:
    // never trust a value just because a previous write validated it) falls
    // back to the known-good defaults rather than rendering broken CSS.
    colors: {
      light: colors?.light ?? DEFAULT_SITE_SETTINGS.colors.light,
      dark: colors?.dark ?? DEFAULT_SITE_SETTINGS.colors.dark,
    },
  };
}

/**
 * Wrapped in React's cache() so the root layout's generateMetadata() and its
 * page body, plus every public page's <Header>, share ONE query per render
 * pass instead of one each -- the same de-duplication getCatalogTools()
 * gets for free from fetch(), which the Supabase client does not do on its
 * own.
 */
export const getSiteSettings = cache(async (): Promise<SiteSettings> => {
  if (!hasSupabaseConfig()) return DEFAULT_SITE_SETTINGS;
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("site_settings")
      .select("brand_name,wordmark_primary,wordmark_secondary,attribution,tagline,logo_url,colors")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return DEFAULT_SITE_SETTINGS;
    return rowToSettings(data as SettingsRow);
  } catch (err) {
    console.error("[settings] site_settings query failed, using static defaults:", err);
    return DEFAULT_SITE_SETTINGS;
  }
});

/** token key -> the CSS custom property name it maps to in globals.css. */
const TOKEN_CSS_VAR: Record<BrandToken, string> = {
  primary: "--primary",
  navy: "--navy",
  leaf: "--leaf",
  logoBlue: "--logo-blue",
  good: "--good",
  warning: "--warning",
  critical: "--critical",
};

function declarations(colors: ModeColors, fallback: ModeColors): string {
  return (Object.keys(TOKEN_CSS_VAR) as BrandToken[])
    .map((token) => {
      // Re-validated on READ, not just trusted because a write once passed
      // theme-validate.ts -- the migration's own comment is explicit that
      // the database does not re-check this shape, so a value that somehow
      // reached the row any other way (a hand edit in the Supabase
      // dashboard, say) cannot inject anything here: an invalid hex falls
      // back to the shipped default for that one token instead of being
      // written into a <style> tag verbatim.
      const raw = colors[token];
      const value = isValidHex(raw) ? raw : fallback[token];
      return `${TOKEN_CSS_VAR[token]}:${value};`;
    })
    .join("");
}

/**
 * The <style> block the root layout injects. --gradient-accent and --focus
 * are deliberately NOT overridden here -- globals.css defines both with
 * var() references (`linear-gradient(90deg, var(--logo-blue), var(--leaf))`,
 * `var(--primary)`), so they recompute live from the tokens above with no
 * separate override needed.
 */
export function buildThemeStyle(settings: SiteSettings): string {
  const light = declarations(settings.colors.light, DEFAULT_SITE_SETTINGS.colors.light);
  const dark = declarations(settings.colors.dark, DEFAULT_SITE_SETTINGS.colors.dark);
  return `:root{${light}}:root.dark{${dark}}`;
}
