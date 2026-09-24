import Link from "next/link";
import { getActiveAnnouncements } from "@/lib/announcements";
import { AnnouncementBar } from "./AnnouncementBar";
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
 * "Sign in" as a small <details> disclosure (same JS-free pattern as the
 * language switcher below) offering the two destinations: User, for staff
 * signing in to Graham Bell on the home page, and Admin, straight into the
 * admin panel's own login.
 */
function SignInMenu({ locale }: { locale: Locale }) {
  const t = getStrings(locale).assistant;
  return (
    <details className="group relative">
      <summary
        aria-label={t.nav}
        className="flex list-none cursor-pointer items-center rounded px-2 py-2 text-sm hover:opacity-70 [&::-webkit-details-marker]:hidden"
        style={{ minHeight: 44, color: "var(--muted)" }}
      >
        {t.nav}
      </summary>
      <nav
        aria-label={t.nav}
        className="absolute right-0 z-20 mt-1 flex flex-col overflow-hidden rounded-md border"
        style={{ borderColor: "var(--line)", background: "var(--surface)", minWidth: 140, boxShadow: "var(--shadow-md)" }}
      >
        <Link
          href={localePath(locale, "/assistant/login")}
          className="flex items-center px-3 text-sm hover:opacity-70"
          style={{ minHeight: 44, color: "var(--foreground)" }}
        >
          {t.userOption}
        </Link>
        <Link
          href="/admin/login"
          className="flex items-center border-t px-3 text-sm hover:opacity-70"
          style={{ minHeight: 44, borderColor: "var(--line)", color: "var(--foreground)" }}
        >
          {t.adminOption}
        </Link>
      </nav>
    </details>
  );
}

/**
 * One control, not three -- a native <details> disclosure, so it needs no
 * JavaScript (same reasoning as the plain links it replaces: this keeps
 * working with JS disabled) and no client component. Each entry still
 * points at the SAME page in the other locale, not at that locale's home.
 */
function LanguageSwitcher({ locale, path }: { locale: Locale; path: string }) {
  const t = getStrings(locale);
  return (
    <details className="group relative">
      <summary
        aria-label={t.language}
        className="flex list-none items-center justify-center gap-0.5 rounded px-2 text-xs font-semibold hover:opacity-70 [&::-webkit-details-marker]:hidden"
        style={{ minWidth: 44, height: 44, color: "var(--muted)" }}
      >
        {LOCALE_LABEL[locale]}
        <span aria-hidden="true" className="text-[9px]">▾</span>
      </summary>
      <nav
        aria-label={t.language}
        className="absolute right-0 z-20 mt-1 flex flex-col overflow-hidden rounded-md border"
        style={{ borderColor: "var(--line)", background: "var(--surface)", minWidth: 128, boxShadow: "var(--shadow-md)" }}
      >
        {LOCALES.map((loc) => {
          const current = loc === locale;
          return (
            <Link
              key={loc}
              href={localePath(loc, path)}
              hrefLang={LOCALE_HREFLANG[loc]}
              lang={LOCALE_HREFLANG[loc]}
              aria-current={current ? "page" : undefined}
              className="flex items-center px-3 text-sm hover:opacity-70"
              style={{
                minHeight: 44,
                color: current ? "var(--foreground)" : "var(--muted)",
                fontWeight: current ? 600 : 400,
                background: current ? "var(--surface-sunken)" : "transparent",
              }}
            >
              {LOCALE_NATIVE_NAME[loc]}
            </Link>
          );
        })}
      </nav>
    </details>
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
  const [settings, announcements] = await Promise.all([getSiteSettings(), getActiveAnnouncements(locale)]);
  const t = getStrings(locale);
  return (
    <>
    {announcements.map((a) => (
      <AnnouncementBar key={a.id} id={a.id} severity={a.severity} text={a.text} closeLabel={t.announcementClose} />
    ))}
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
          <SignInMenu locale={locale} />
          <LanguageSwitcher locale={locale} path={path} />
          <ThemeToggle locale={locale} />
        </div>
      </div>
      <div aria-hidden="true" style={{ height: 3, background: "var(--gradient-accent)", display: "var(--accent-display)" }} />
    </header>
    </>
  );
}
