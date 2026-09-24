import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { getStrings } from "@/lib/strings";
import { isLocale, localePath, toLocale } from "@/lib/i18n";
import { localeAlternates } from "@/lib/alternates";

// Header reads the live brand settings; same timer as every public route.
export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getStrings(locale);
  return {
    title: t.about,
    description: t.aboutDescription,
    alternates: localeAlternates(locale, "/about"),
  };
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = toLocale((await params).locale);
  const t = getStrings(locale);
  return (
    <>
      <Header locale={locale} path="/about" />
      <main className="mx-auto max-w-[640px] px-4 pb-24 pt-14">
        <h1 className="text-3xl font-semibold tracking-tight">{t.about}</h1>
        <div className="mt-6 space-y-4 text-[15px] leading-relaxed" style={{ color: "var(--muted)" }}>
          {t.aboutBody.map((para) => (
            <p key={para.slice(0, 24)}>{para}</p>
          ))}
        </div>
        <p className="mt-10">
          <Link
            href={localePath(locale)}
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
