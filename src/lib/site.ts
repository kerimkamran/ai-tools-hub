/**
 * Canonical origin, resolved from env with sensible fallbacks.
 *
 * Never hardcode a hostname in source: this is the single switch that moves
 * the hub to a custom domain later, and it is why metadataBase, robots and
 * sitemap all stay correct when that happens.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}
