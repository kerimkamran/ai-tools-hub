import "server-only";

/**
 * Raster image uploads (tool logos, the site logo). The declared type must
 * be PNG/JPEG/WebP AND the bytes must match it -- an SVG (which can carry
 * <script>) renamed to .png is refused.
 */
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function readRaster(file: File, maxBytes: number): Promise<{ dataUrl: string } | { error: string }> {
  if (!ALLOWED.has(file.type)) return { error: "Use a PNG, JPEG or WebP image. SVG is not accepted." };
  if (file.size > maxBytes) return { error: `The image must be ${Math.round(maxBytes / 1024)} KB or smaller.` };
  const bytes = Buffer.from(await file.arrayBuffer());
  const png = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const webp = bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP";
  const matches = (file.type === "image/png" && png) || (file.type === "image/jpeg" && jpg) || (file.type === "image/webp" && webp);
  if (!matches) return { error: "That file is not a real PNG, JPEG or WebP image." };
  return { dataUrl: `data:${file.type};base64,${bytes.toString("base64")}` };
}

/** Decodes a stored data URL for serving, or null if it is not one of ours. */
export function decodeRaster(dataUrl: string | null | undefined): { type: string; bytes: Buffer } | null {
  const m = dataUrl?.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  return m ? { type: m[1], bytes: Buffer.from(m[2], "base64") } : null;
}
