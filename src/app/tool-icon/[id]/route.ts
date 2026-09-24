import { queryOne } from "@/lib/db/client";
import { decodeRaster } from "@/lib/raster";

/**
 * A tool's uploaded logo. Only for tools a visitor can see (published,
 * planned, unlisted) -- a draft's logo is served by the admin route instead.
 * Cached; the ?v= version in the page's link changes when the logo does.
 */
export const revalidate = 60;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9-]{1,64}$/.test(id)) return new Response(null, { status: 404 });
  const row = await queryOne<{ icon_image: string | null }>(
    "select icon_image from tools where id = $1 and status in ('published', 'planned', 'unlisted')",
    [id]
  ).catch(() => null);
  const img = decodeRaster(row?.icon_image);
  if (!img) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(img.bytes), {
    headers: { "Content-Type": img.type, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" },
  });
}
