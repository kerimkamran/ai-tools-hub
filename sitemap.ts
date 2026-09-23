import type { MetadataRoute } from "next";
import { getCatalogTools } from "@/lib/registry";
import { siteUrl } from "@/lib/site";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const tools = await getCatalogTools();

  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/about`, changeFrequency: "yearly", priority: 0.3 },
    // getCatalogTools returns published + planned only, so `unlisted` and
    // `archived` never reach the sitemap.
    ...tools.map((t) => ({
      url: `${base}/tools/${t.slug}`,
      lastModified: new Date(t.updatedAt),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
