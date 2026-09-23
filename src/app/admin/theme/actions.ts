"use server";

import { revalidatePath } from "next/cache";
import { query } from "@/lib/db/client";
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
// covers the need.
const LOGO_MIME_ALLOWLIST = new Set(["image/png", "image/jpeg", "image/webp"]);
const LOGO_MAX_BYTES = 512 * 1024;

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

  // Logo is optional per save -- only replace it when a real file arrived.
  // An empty file input still submits an empty File in some browsers, so
  // size is checked, not just presence.
  //
  // Render has no equivalent to Supabase Storage, so the logo is stored
  // directly in site_settings.logo_url as a data: URL rather than uploaded
  // to object storage. The same 512KB cap and raster-only allowlist apply
  // before encoding; base64 adds ~33%, so the stored value stays comfortably
  // under 1MB, which Postgres and a text column handle without difficulty.
  let logoDataUrl: string | undefined;
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
    const bytes = Buffer.from(await logoFile.arrayBuffer());
    logoDataUrl = `data:${logoFile.type};base64,${bytes.toString("base64")}`;
  }

  try {
    await query(
      `insert into site_settings
         (id, brand_name, wordmark_primary, wordmark_secondary, attribution, tagline, colors, updated_by, logo_url)
       values (1, $1, $2, $3, $4, $5, $6, $7, coalesce($8, (select logo_url from site_settings where id = 1)))
       on conflict (id) do update set
         brand_name = excluded.brand_name,
         wordmark_primary = excluded.wordmark_primary,
         wordmark_secondary = excluded.wordmark_secondary,
         attribution = excluded.attribution,
         tagline = excluded.tagline,
         colors = excluded.colors,
         updated_by = excluded.updated_by,
         logo_url = excluded.logo_url`,
      [
        input.brandName,
        input.wordmarkPrimary,
        input.wordmarkSecondary,
        input.attribution,
        input.tagline,
        JSON.stringify(toColorsColumn(input)),
        superAdmin.email,
        logoDataUrl ?? null,
      ]
    );
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the theme." };
  }

  // The gate: "a colour change reaches the public page in seconds". Every
  // route reads settings via the root layout, so this busts the whole tree
  // in one call rather than one revalidatePath per route.
  revalidatePath("/", "layout");
  revalidatePath("/admin/theme");

  return { ok: true };
}
