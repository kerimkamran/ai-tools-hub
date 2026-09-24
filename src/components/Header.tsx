import Link from "next/link";
import { getStrings } from "@/lib/strings";
import { getSiteSettings, type SiteSettings } from "@/lib/settings";
import {
  LOCALES,
  LOCALE_HREFLANG,
  LOCALE_LABEL,
  LOCALE_NATIVE_NAME,
  localePath,
  type Locale,
} from "@/lib/i18n";
import { ThemeToggle } from "./ThemeToggle";

/**
 * The wordmark. One typeface, two tones, lowercase, tight tracking --
 * SparkLab's own lockup shape. Text and attribution come from the theme
 * editor, so an admin can retitle the hub without a code change; the
 * colours are plain --navy/--leaf CSS vars, which the root layout's
 * injected <style> block overrides to match.
 */
function Wordmark({ settings }: { settings: SiteSettings }) {
  return (
    <span className="flex flex-col leading-none">
      <span className="text-[15px] font-extrabold lowercase tracking-tight">
        <span style={{ color: "var(--navy)" }}>{settings.wordmarkPrimary}</span>
        <span style={{ color: "var(--leaf)" }}>{settings.wordmarkSecondary}</span>
      </span>
      {settings.attribution && (
        <span className="mt-0.5 text-[9px] tracking-wide" style={{ color: "var(--faint)" }}>
          {settings.attribution}
        </span>
      )}
    </span>
  );
}

/**
 * Plain links, no JavaScript -- so switching language keeps working with JS
 * disabled like the rest of the page. Each link points at the SAME page in
 * the other locale, not at that locale's home.
 */
function LanguageSwitcher({ locale, path }: { locale: Locale; path: string }) {
  const t = getStrings(locale);
  return (
    <nav aria-label={t.language} className="flex items-center">
      {LOCALES.map((loc) => {
        const current = loc === locale;
        return (
          <Link
            key={loc}
            href={localePath(loc, path)}
            hrefLang={LOCALE_HREFLANG[loc]}
            lang={LOCALE_HREFLANG[loc]}
            aria-current={current ? "page" : undefined}
            aria-label={LOCALE_NATIVE_NAME[loc]}
            className="flex items-center justify-center rounded text-xs font-semibold hover:opacity-70"
            style={{
              minWidth: 32,
              height: 44,
              color: current ? "var(--foreground)" : "var(--muted)",
              textDecoration: current ? "underline" : "none",
              textUnderlineOffset: 4,
            }}
          >
            {LOCALE_LABEL[loc]}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The wordmark, navigation, language switcher, theme toggle, and the
 * signature accent rule -- the blue→green gradient used once per page.
 *
 * `path` is the current page's path WITHOUT the locale prefix ("" for the
 * catalog, "/about", "/tools/<slug>"), so the switcher can link to the same
 * page in each language.
 */
export async function Header({ locale, path = "" }: { locale: Locale; path?: string }) {
  const settings = await getSiteSettings();
  const t = getStrings(locale);
  return (
    <header
      className="sticky top-0 z-10 backdrop-blur"
      style={{ background: "color-mix(in srgb, var(--background) 88%, transparent)" }}
    >
      <div className="mx-auto flex h-16 max-w-[1100px] items-center justify-between gap-2 px-4">
        <Link href={localePath(locale)} className="shrink-0 hover:opacity-70" aria-label={settings.brandName}>
          <Wordmark settings={settings} />
        </Link>
        <div className="flex items-center gap-0.5 sm:gap-1">
          <Link
            href={localePath(locale, "/about")}
            className="hidden rounded px-2 py-2 text-sm hover:opacity-70 sm:block"
            style={{ color: "var(--muted)" }}
          >
            {t.about}
          </Link>
          <Link
            href={localePath(locale, "/assistant")}
            className="rounded px-2 py-2 text-sm hover:opacity-70"
            style={{ color: "var(--muted)" }}
          >
            {t.assistant.nav}
          </Link>
          <LanguageSwitcher locale={locale} path={path} />
          <ThemeToggle locale={locale} />
        </div>
      </div>
      <div aria-hidden="true" style={{ height: 3, background: "var(--gradient-accent)" }} />
    </header>
  );
}
