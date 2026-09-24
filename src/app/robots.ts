import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // The admin surface, the staff assistant and the API are not content.
        disallow: ["/admin", "/admin/", "/api/", "/en/assistant", "/az/assistant", "/ru/assistant"],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
