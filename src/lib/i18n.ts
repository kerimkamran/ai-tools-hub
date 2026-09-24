/**
 * Locales (Phase C).
 *
 * Locale lives in the URL (/en, /az, /ru), never in a cookie or an
 * Accept-Language sniff: per-request detection would make every public route
 * dynamic, for exactly the same reason reading cookies would. Each locale is a
 * separately prerendered, separately indexable copy of the catalog.
 *
 * Safe to import from client components -- no server-only code here.
 */

export const LOCALES = ["en", "az", "ru"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** Locales that have translations stored alongside the English base columns. */
export const TRANSLATED_LOCALES = ["az", "ru"] as const;
export type TranslatedLocale = (typeof TRANSLATED_LOCALES)[number];

export const LOCALE_LABEL: Record<Locale, string> = {
  en: "EN",
  az: "AZ",
  ru: "RU",
};

/** Name of each language in that language, for the switcher's aria-label. */
export const LOCALE_NATIVE_NAME: Record<Locale, string> = {
  en: "English",
  az: "Azərbaycanca",
  ru: "Русский",
};

/** BCP 47 tags for hreflang and the lang attribute. */
export const LOCALE_HREFLANG: Record<Locale, string> = {
  en: "en",
  az: "az",
  ru: "ru",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function toLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Path for a page in a given locale. `path` is "" for the catalog, or starts with "/". */
export function localePath(locale: Locale, path = ""): string {
  return `/${locale}${path}`;
}

/**
 * Per-locale translations of a few text fields, as stored in a JSONB column:
 * { "az": { "name": "...", ... }, "ru": { ... } }. English is NOT stored here
 * -- it is the base column -- so the fallback chain is simply
 * requested locale -> base column. An untranslated field renders in English,
 * never blank.
 */
export type I18nMap<K extends string> = Partial<Record<TranslatedLocale, Partial<Record<K, string>>>>;

export function pickLocalized<K extends string>(
  i18n: I18nMap<K> | null | undefined,
  locale: Locale,
  key: K,
  base: string
): string {
  if (locale === "en") return base;
  const value = i18n?.[locale]?.[key];
  return typeof value === "string" && value.trim() ? value : base;
}

/** Which translated locales are missing any of `keys` (for admin indicators). */
export function missingTranslations<K extends string>(
  i18n: I18nMap<K> | null | undefined,
  keys: K[],
  hasBase: (key: K) => boolean = () => true
): TranslatedLocale[] {
  return TRANSLATED_LOCALES.filter((loc) =>
    keys.some((k) => hasBase(k) && !(i18n?.[loc]?.[k] ?? "").trim())
  );
}

/**
 * Normalises whatever came out of a JSONB column into an I18nMap with only
 * known locales, known keys and string values. A READ path with a public
 * fallback never trusts the stored shape blindly.
 */
export function sanitizeI18n<K extends string>(raw: unknown, keys: readonly K[]): I18nMap<K> {
  const out: I18nMap<K> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const loc of TRANSLATED_LOCALES) {
    const entry = (raw as Record<string, unknown>)[loc];
    if (!entry || typeof entry !== "object") continue;
    const fields: Partial<Record<K, string>> = {};
    for (const k of keys) {
      const v = (entry as Record<string, unknown>)[k];
      if (typeof v === "string" && v.trim()) fields[k] = v;
    }
    if (Object.keys(fields).length) out[loc] = fields;
  }
  return out;
}
