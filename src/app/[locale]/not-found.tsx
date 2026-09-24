"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { getStrings } from "@/lib/strings";
import { localePath, toLocale } from "@/lib/i18n";

/**
 * 404 inside a locale. not-found boundaries receive no params, so the locale
 * is read on the client from the URL; the server-rendered HTML falls back to
 * English, which is also what a visitor with JavaScript off sees.
 */
export default function LocaleNotFound() {
  const params = useParams<{ locale?: string }>();
  const locale = toLocale(params?.locale);
  const t = getStrings(locale);
  return (
    <main className="mx-auto max-w-[640px] px-4 pb-24 pt-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{t.notFoundTitle}</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        {t.notFoundBody}
      </p>
      <p className="mt-8">
        <Link
          href={localePath(locale)}
          className="text-sm underline underline-offset-4 hover:opacity-70"
          style={{ color: "var(--foreground)" }}
        >
          {t.backToHub}
        </Link>
      </p>
    </main>
  );
}
