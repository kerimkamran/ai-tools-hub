"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSuperAdminOrNull } from "@/lib/auth";
import {
  describeContrastFailures,
  findContrastFailures,
  themeInputSchema,
  toColorsColumn,
  type BrandToken,
} from "@/lib/theme-validate";

/**
 * Theme editor, super-admin only. Two mandatory controls, per the plan:
 * no free-form CSS (only the fixed token names in theme-validate.ts, only
 * strict 6-digit hex) and a live contrast gate that refuses to save a
 * palette that would regress accessibility. Neither is optional and neither
 * is bypassable from this action -- both happen before any write.
 */

export type ThemeState = {
  error?: string;
  contrastFailures?: string[];
  fieldErrors?: Record<string, string>;
  ok?: boolean;
};

const BRAND_TOKEN_KEYS: BrandToken[] = [
  "primary",
  "navy",
  "leaf",
  "logoBlue",
  "good",
  "warning",
  "critical",
];

function formToInput(formData: FormData) {
  const mode = (m: "light" | "dark") => {
    const out: Record<string, string> = {};
    for (const token of BRAND_TOKEN_KEYS) {
      out[token] = String(formData.get(`${m}.${token}`) ?? "").trim();
    }
    return out;
  };
  return {
    brandName: String(formData.get("brandName") ?? "").trim(),
    wordmarkPrimary: String(formData.get("wordmarkPrimary") ?? "").trim(),
    wordmarkSecondary: String(formData.get("wordmarkSecondary") ?? "").trim(),
    attribution: String(formData.get("attribution") ?? "").trim(),
    tagline: String(formData.get("tagline") ?? "").trim(),
    light: mode("light"),
    dark: mode("dark"),
  };
}

// Raster only, SVG rejected -- an SVG can carry <script>, and a raster logo
// covers the need. Duplicated at the Storage bucket level too
// (0004_site_settings.sql) as defence in depth.
const LOGO_MIME_ALLOWLIST = new Set(["image/png", "image/jpeg", "image/webp"]);
const LOGO_MAX_BYTES = 512 * 1024;
const LOGO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function saveTheme(
  _prev: ThemeState,
  formData: FormData
): Promise<ThemeState> {
  const superAdmin = await getSuperAdminOrNull();
  if (!superAdmin?.email) return { error: "Not signed in as a super admin." };

  const parsed = themeInputSchema.safeParse(formToInput(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }
  const input = parsed.data;

  // The gate. Computed fresh on the server from the submitted values --
  // never trusted from the client, which could send anything.
  const failures = findContrastFailures(input);
  if (failures.length > 0) {
    return {
      error: "This palette fails the contrast gate and was not saved.",
      contrastFailures: describeContrastFailures(failures),
    };
  }

  const admin = createAdminClient();

  // Logo is optional per save -- only replace it when a real file arrived.
  // An empty file input still submits an empty File in some browsers, so
  // size is checked, not just presence.
  let logoUrl: string | undefined;
  const logoFile = formData.get("logo");
  if (logoFile instanceof File && logoFile.size > 0) {
    if (!LOGO_MIME_ALLOWLIST.has(logoFile.type)) {
      return {
        error: "Logo must be PNG, JPEG or WebP. SVG is not accepted.",
        fieldErrors: { logo: "Unsupported file type." },
      };
    }
    if (logoFile.size > LOGO_MAX_BYTES) {
      return {
        error: "Logo must be 512 KB or smaller.",
        fieldErrors: { logo: "Too large." },
      };
    }
    const ext = LOGO_EXT[logoFile.type];
    // Timestamped filename: a new upload gets a new URL, so the browser and
    // any CDN in front of Storage never serve a stale cached logo -- no
    // cache-busting query string needed.
    const path = `logo-${Date.now()}.${ext}`;
    const bytes = new Uint8Array(await logoFile.arrayBuffer());
    const { error: uploadError } = await admin.storage
      .from("branding")
      .upload(path, bytes, { contentType: logoFile.type, upsert: false });
    if (uploadError) {
      return { error: `Logo upload failed: ${uploadError.message}` };
    }
    const { data: pub } = admin.storage.from("branding").getPublicUrl(path);
    logoUrl = pub.publicUrl;
  }

  const row: Record<string, unknown> = {
    id: 1,
    brand_name: input.brandName,
    wordmark_primary: input.wordmarkPrimary,
    wordmark_secondary: input.wordmarkSecondary,
    attribution: input.attribution,
    tagline: input.tagline,
    colors: toColorsColumn(input),
    updated_by: superAdmin.email,
  };
  if (logoUrl) row.logo_url = logoUrl;

  const { error } = await admin.from("site_settings").upsert(row, { onConflict: "id" });
  if (error) return { error: error.message };

  // The gate: "a colour change reaches the public page in seconds". Every
  // route reads settings via the root layout, so this busts the whole tree
  // in one call rather than one revalidatePath per route.
  revalidatePath("/", "layout");
  revalidatePath("/admin/theme");

  return { ok: true };
}
