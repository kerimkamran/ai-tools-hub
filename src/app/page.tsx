import { Header } from "@/components/Header";
import { SearchAndFilter } from "@/components/SearchAndFilter";
import { getCatalogTools } from "@/lib/registry";
import { strings } from "@/lib/strings";

/**
 * The catalog.
 *
 * Statically rendered and revalidated on a timer. It reads the registry with
 * the anon client and touches neither cookies nor searchParams -- either would
 * opt this route into dynamic rendering and cost the edge-cached delivery that
 * is the whole point of the page. The `?q=` deep link is therefore read on the
 * client instead (see SearchAndFilter); with JavaScript off there is no
 * filtering to restore anyway, and the full grid is already in the HTML.
 *
 * The complete server-rendered grid is why this works with JS disabled and
 * why it is indexable.
 */
export const revalidate = 60;

export default async function HomePage() {
  const tools = await getCatalogTools();

  return (
    <>
      <Header />
      <main className="mx-auto max-w-[1100px] px-4 pb-24">
        <div className="pt-14 pb-8 text-center sm:pt-20">
          <h1 className="text-[34px] font-semibold leading-tight tracking-tight sm:text-[40px]">
            {strings.brand}
          </h1>
          <p className="mx-auto mt-2 max-w-[480px] text-[15px]" style={{ color: "var(--muted)" }}>
            {strings.tagline}
          </p>
        </div>
        <SearchAndFilter tools={tools} />
      </main>
    </>
  );
}
