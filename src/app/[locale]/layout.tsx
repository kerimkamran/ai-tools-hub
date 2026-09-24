import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LOCALES, LOCALE_HREFLANG, isLocale } from "@/lib/i18n";
import { getStrings } from "@/lib/strings";
import { getSiteSettings, localizedTagline } from "@/lib/settings";
import { localeAlternates } from "@/lib/alternates";
import { UsageBeacon } from "@/components/UsageBeacon";
import { GrahamBellWidget } from "@/components/GrahamBellWidget";

/**
 * Every public page lives under /en, /az or /ru and is prerendered once per
 * locale. An unknown first segment is a 404 via the isLocale() check below.
 *
 * Deliberately NOT `dynamicParams = false`: in this Next.js version that
 * made every ISR regeneration of these pages fail with NoFallbackError, so
 * catalog edits never reached the public pages. Verified by hand.
 */

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getStrings(locale);
  const settings = await getSiteSettings();
  const title = `${settings.brandName} — ${localizedTagline(settings, locale)}`;
  return {
    // absolute: the root layout's own "%s · brand" template must not wrap
    // this segment's home title a second time.
    title: { absolute: title, template: `%s · ${settings.brandName}` },
    description: t.siteDescription,
    alternates: localeAlternates(locale),
    openGraph: {
      type: "website",
      siteName: settings.brandName,
      title,
      description: t.siteDescription,
      locale: LOCALE_HREFLANG[locale],
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  // The root layout owns <html> and cannot see this segment's params, so the
  // document language is set here: `lang` on the wrapper (which is what
  // screen readers use for the content) and a one-line script that corrects
  // <html lang> before first paint. Both are static per locale, so this
  // stays prerendered.
  const setLang = `document.documentElement.lang=${JSON.stringify(LOCALE_HREFLANG[locale])};`;
  // Mounted here, not on any one page, so Graham Bell floats on every public
  // page (home, about, a tool's detail page, the sign-in page itself) from
  // one place. A client component, so this stays static/cookie-free too.
  const settings = await getSiteSettings();
  return (
    <div lang={LOCALE_HREFLANG[locale]}>
      <script dangerouslySetInnerHTML={{ __html: setLang }} />
      <UsageBeacon locale={locale} />
      {children}
      <GrahamBellWidget locale={locale} careersUrl={settings.careersUrl} />
    </div>
  );
}
