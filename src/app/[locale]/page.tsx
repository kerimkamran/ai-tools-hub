import { Header } from "@/components/Header";
import { SearchAndFilter } from "@/components/SearchAndFilter";
import { BrandTitle } from "@/components/BrandTitle";
import { getCatalogTools, getCategoryLabels } from "@/lib/registry";
import { getSiteSettings, localizedTagline } from "@/lib/settings";
import { localizeTool } from "@/lib/types";
import { toLocale } from "@/lib/i18n";

/**
 * The catalog, once per locale.
 *
 * Statically rendered and revalidated on a timer. It touches neither cookies
 * nor searchParams -- either would opt this route into dynamic rendering and
 * cost the cached delivery that is the whole point of the page. The `?q=`
 * deep link is read on the client instead (see SearchAndFilter).
 *
 * Tools are localized HERE, on the server, so the HTML already carries the
 * visitor's language and the page still works with JavaScript disabled.
 */
export const revalidate = 60;

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = toLocale((await params).locale);
  const [tools, categories, settings] = await Promise.all([
    getCatalogTools(),
    getCategoryLabels(),
    getSiteSettings(),
  ]);
  const localized = tools.map((t) => localizeTool(t, locale, categories));

  return (
    <>
      <Header locale={locale} />
      <main className="mx-auto max-w-[1100px] px-4 pb-24">
        <div className="pt-14 pb-8 text-center sm:pt-20">
          <h1 className="text-[34px] font-semibold leading-tight tracking-tight sm:text-[40px]">
            <BrandTitle name={settings.brandName} />
          </h1>
          <p className="mx-auto mt-2 max-w-[480px] text-[15px]" style={{ color: "var(--muted)" }}>
            {localizedTagline(settings, locale)}
          </p>
        </div>
        <SearchAndFilter tools={localized} locale={locale} />
      </main>
    </>
  );
}
