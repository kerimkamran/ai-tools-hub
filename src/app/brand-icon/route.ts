import { getSiteSettings } from "@/lib/settings";

/**
 * Favicon generated from the uploaded logo (capability 9). The logo is a
 * PNG/JPEG/WebP data URL validated on upload (SVG is refused); it is decoded
 * here and served as an image. Static + revalidated like every public route,
 * and it reads no cookies.
 */
export const revalidate = 60;

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function GET() {
  const { logoUrl } = await getSiteSettings();
  const m = logoUrl?.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m || !ALLOWED.has(m[1])) return new Response(null, { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: {
      "Content-Type": m[1],
      "Cache-Control": "public, max-age=300, s-maxage=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
