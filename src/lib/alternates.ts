import type { Metadata } from "next";
import { LOCALES, LOCALE_HREFLANG, localePath, type Locale } from "./i18n";

/**
 * canonical + hreflang alternates for a page that exists in every locale.
 * `path` excludes the locale prefix ("" for the catalog, "/about", ...).
 * Relative URLs resolve against metadataBase (the root layout sets it from
 * siteUrl()), so nothing here hardcodes a hostname.
 */
export function localeAlternates(locale: Locale, path = ""): Metadata["alternates"] {
  const languages: Record<string, string> = {};
  for (const loc of LOCALES) languages[LOCALE_HREFLANG[loc]] = localePath(loc, path);
  languages["x-default"] = localePath("en", path);
  return { canonical: localePath(locale, path), languages };
}
