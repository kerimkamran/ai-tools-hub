import { z } from "zod";

/**
 * Brand text for the Design Studio. Colours, type and shape are validated
 * in src/lib/design.ts (fixed lists, strict hex, the contrast gate).
 */
export const brandSchema = z.object({
  brandName: z.string().trim().min(1).max(60),
  wordmarkPrimary: z.string().trim().min(1).max(20),
  wordmarkSecondary: z.string().trim().min(1).max(20),
  attribution: z.string().trim().max(60).default(""),
  tagline: z.string().trim().min(1).max(120),
  // Optional per-locale taglines (Phase C). Blank = fall back to English.
  taglineAz: z.string().trim().max(120).default(""),
  taglineRu: z.string().trim().max(120).default(""),
});
export type Brand = z.infer<typeof brandSchema>;
