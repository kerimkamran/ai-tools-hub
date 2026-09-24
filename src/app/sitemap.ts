import type { MetadataRoute } from "next";
import { getCatalogTools } from "@/lib/registry";
import { siteUrl } from "@/lib/site";
import { LOCALES, LOCALE_HREFLANG, localePath } from "@/lib/i18n";

export const revalidate = 3600;

/**
 * Every public page in all three locales, each entry carrying its hreflang
 * alternates. getCatalogTools returns published + planned only, so
 * `unlisted` and `archived` never reach the sitemap.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const tools = await getCatalogTools();

  const languages = (path: string) =>
    Object.fromEntries(LOCALES.map((l) => [LOCALE_HREFLANG[l], `${base}${localePath(l, path)}`]));

  const pages: Array<{
    path: string;
    changeFrequency: "weekly" | "yearly" | "monthly";
    priority: number;
    lastModified?: Date;
  }> = [
    { path: "", changeFrequency: "weekly", priority: 1 },
    { path: "/about", changeFrequency: "yearly", priority: 0.3 },
    ...tools.map((t) => ({
      path: `/tools/${t.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
      lastModified: new Date(t.updatedAt),
    })),
  ];

  return pages.flatMap((p) =>
    LOCALES.map((locale) => ({
      url: `${base}${localePath(locale, p.path)}`,
      changeFrequency: p.changeFrequency,
      priority: p.priority,
      ...(p.lastModified ? { lastModified: p.lastModified } : {}),
      alternates: { languages: languages(p.path) },
    }))
  );
}
