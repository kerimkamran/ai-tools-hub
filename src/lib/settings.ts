import "server-only";
import { cache } from "react";
import { hasDatabaseConfig, queryOne } from "@/lib/db/client";
import { DEFAULT_LOOK, lookCss, sanitizeLook, type Look } from "@/lib/design";
import { strings } from "@/lib/strings";
import { pickLocalized, sanitizeI18n, type I18nMap, type Locale } from "@/lib/i18n";

/**
 * THE SEAM for site branding, same pattern as src/lib/registry.ts for tools:
 * every read of the live theme goes through this module, so the root layout
 * (and anything else that ever needs it) does not know or care where the
 * settings row lives.
 *
 * Never touches cookies -- for the same reason the public catalog doesn't:
 * the root layout renders for every route, so touching cookies here would
 * opt the whole app into dynamic rendering and destroy the catalog's static
 * delivery. A save in the theme editor calls revalidatePath("/", "layout")
 * instead, which busts the ISR snapshot everywhere this module is read from.
 */

export type SiteSettings = {
  brandName: string;
  wordmarkPrimary: string;
  wordmarkSecondary: string;
  attribution: string;
  tagline: string;
  /** AZ/RU taglines (Phase C). English is `tagline`. */
  taglineI18n: I18nMap<"tagline">;
  logoUrl: string | null;
  /** The look in effect right now: an active scheduled look, else the published one. */
  look: Look;
  /** Name of the scheduled look in effect, if any. */
  scheduled: string | null;
};

/** The tagline in `locale`, falling back to the English one. */
export function localizedTagline(settings: SiteSettings, locale: Locale): string {
  return pickLocalized(settings.taglineI18n, locale, "tagline", settings.tagline);
}

/**
 * Exactly what Phase A shipped in globals.css and db/migrations/0002 seeds
 * -- so an unconfigured or unreachable database renders identically to
 * today, the same fallback discipline src/lib/registry.ts uses for tools.
 */
export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  brandName: strings.brand,
  wordmarkPrimary: "one",
  wordmarkSecondary: ".simple",
  attribution: "by Azerconnect Group",
  tagline: strings.tagline,
  taglineI18n: {
    az: { tagline: "Yaratdığımız hər şey, bir yerdə." },
    ru: { tagline: "Всё, что мы создали, — в одном месте." },
  },
  logoUrl: null,
  look: DEFAULT_LOOK,
  scheduled: null,
};

type SettingsRow = {
  brand_name: string;
  wordmark_primary: string;
  wordmark_secondary: string;
  attribution: string;
  tagline: string;
  tagline_i18n?: unknown;
  logo_url: string | null;
  look: unknown;
  scheduled_look: unknown;
  scheduled_name: string | null;
};

function rowToSettings(row: SettingsRow): SiteSettings {
  // A READ path with a public fallback: the look is re-validated here
  // (sanitizeLook) rather than trusted because a write once passed the gate.
  const published = sanitizeLook(row.look);
  return {
    brandName: row.brand_name,
    wordmarkPrimary: row.wordmark_primary,
    wordmarkSecondary: row.wordmark_secondary,
    attribution: row.attribution,
    tagline: row.tagline,
    taglineI18n: sanitizeI18n(row.tagline_i18n, ["tagline"] as const),
    logoUrl: row.logo_url,
    look: row.scheduled_look ? sanitizeLook(row.scheduled_look, published) : published,
    scheduled: row.scheduled_look ? row.scheduled_name : null,
  };
}

/**
 * Wrapped in React's cache() so the root layout's generateMetadata() and its
 * page body, plus every public page's <Header>, share ONE query per render
 * pass instead of one each -- the same de-duplication getCatalogTools()
 * would get for free from fetch(), which a database driver does not do on
 * its own.
 */
export const getSiteSettings = cache(async (): Promise<SiteSettings> => {
  if (!hasDatabaseConfig()) return DEFAULT_SITE_SETTINGS;
  try {
    const row = await queryOne<SettingsRow>(
      // The active schedule is decided HERE, at render time (engineering
      // rule 4): with revalidate = 60 on every public route, a scheduled look
      // starts and ends on every page within the minute.
      `select s.brand_name, s.wordmark_primary, s.wordmark_secondary, s.attribution, s.tagline,
              s.tagline_i18n, s.logo_url, s.look,
              sch.look as scheduled_look, sch.name as scheduled_name
         from site_settings s
         left join lateral (
           select look, name from theme_schedules
            where now() >= starts_at and now() < ends_at
            order by starts_at desc limit 1
         ) sch on true
        where s.id = 1`
    );
    if (!row) return DEFAULT_SITE_SETTINGS;
    return rowToSettings(row);
  } catch (err) {
    console.error("[settings] site_settings query failed, using static defaults:", err);
    return DEFAULT_SITE_SETTINGS;
  }
});

/**
 * The <style> block the root layout injects: the look as CSS custom
 * properties only (src/lib/design.ts lookCss). --gradient-accent and --focus
 * keep recomputing from the tokens through their var() references in
 * globals.css.
 */
export function buildThemeStyle(settings: SiteSettings): string {
  return lookCss(settings.look);
}
