import Link from "next/link";
import { Header } from "@/components/Header";
import { getStrings } from "@/lib/strings";
import { DEFAULT_LOCALE, localePath } from "@/lib/i18n";

/** 404 outside any locale segment (e.g. an unknown top-level path). English. */
export default function NotFound() {
  const t = getStrings(DEFAULT_LOCALE);
  return (
    <>
      <Header locale={DEFAULT_LOCALE} />
      <main className="mx-auto max-w-[640px] px-4 pb-24 pt-24 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t.notFoundTitle}</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          {t.notFoundBody}
        </p>
        <p className="mt-8">
          <Link
            href={localePath(DEFAULT_LOCALE)}
            className="text-sm underline underline-offset-4 hover:opacity-70"
            style={{ color: "var(--foreground)" }}
          >
            {t.backToHub}
          </Link>
        </p>
      </main>
    </>
  );
}
