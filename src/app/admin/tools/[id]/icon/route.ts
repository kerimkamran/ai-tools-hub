import { requirePermission } from "@/lib/auth";
import { queryOne } from "@/lib/db/client";
import { decodeRaster } from "@/lib/raster";

/** Any tool's logo, drafts included, for the admin pages. */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requirePermission("catalog.view");
  const { id } = await params;
  const row = await queryOne<{ icon_image: string | null }>("select icon_image from tools where id = $1", [id]);
  const img = decodeRaster(row?.icon_image);
  if (!img) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(img.bytes), {
    headers: { "Content-Type": img.type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
