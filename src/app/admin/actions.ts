"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query, queryOne } from "@/lib/db/client";
import { getAdminOrNull } from "@/lib/auth";
import { compactI18n, emptyToNull, parseTags, toolI18nSchema, toolInputSchema } from "@/lib/validate";

/**
 * Every mutating action re-checks the user itself. It does NOT rely on the
 * proxy having run -- see src/lib/auth.ts.
 */

export type ActionState = { error?: string; fieldErrors?: Record<string, string> };

function formToInput(formData: FormData) {
  return {
    id: String(formData.get("id") ?? "").trim(),
    slug: String(formData.get("slug") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    tagline: String(formData.get("tagline") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    category: String(formData.get("category") ?? "").trim(),
    tags: parseTags(formData.get("tags")),
    icon: String(formData.get("icon") ?? "").trim(),
    url: String(formData.get("url") ?? "").trim(),
    healthUrl: emptyToNull(formData.get("healthUrl")),
    access: String(formData.get("access") ?? "sign-in"),
    accessNote: emptyToNull(formData.get("accessNote")),
    status: String(formData.get("status") ?? "planned"),
    sortOrder: String(formData.get("sortOrder") ?? "0"),
  };
}

function formToI18n(formData: FormData) {
  const read = (loc: "az" | "ru") => ({
    name: String(formData.get(`name_${loc}`) ?? ""),
    tagline: String(formData.get(`tagline_${loc}`) ?? ""),
    description: String(formData.get(`description_${loc}`) ?? ""),
    accessNote: String(formData.get(`accessNote_${loc}`) ?? ""),
  });
  return { az: read("az"), ru: read("ru") };
}

/**
 * Since Phase C every public page exists once per locale (/en, /az, /ru),
 * so a catalog change busts the whole public tree in one call rather than
 * listing every locale x route combination by hand -- the same approach the
 * theme editor already uses.
 */
function revalidateAll() {
  revalidatePath("/", "layout");
  revalidatePath("/sitemap.xml");
}

type PgError = { code?: string; constraint?: string; message: string };

function isPgError(err: unknown): err is PgError {
  return typeof err === "object" && err !== null && "message" in err;
}

function mapWriteError(err: unknown): ActionState {
  if (isPgError(err)) {
    if (err.code === "23505") {
      // Unique violation. The constraint name tells us which index tripped.
      if (err.constraint?.includes("pkey")) {
        return {
          error: "That ID is already used by another tool.",
          fieldErrors: { id: "Already taken." },
        };
      }
      return {
        error: "That slug is already used by another tool.",
        fieldErrors: { slug: "Already taken." },
      };
    }
    if (err.code === "23514") {
      return { error: "A published tool needs a URL.", fieldErrors: { url: "Required to publish." } };
    }
    return { error: err.message };
  }
  return { error: "Something went wrong. Please try again." };
}

export async function saveTool(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  if (!(await getAdminOrNull())) return { error: "Not signed in." };

  const parsed = toolInputSchema.safeParse(formToInput(formData));

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }

  const t = parsed.data;

  const parsedI18n = toolI18nSchema.safeParse(formToI18n(formData));
  if (!parsedI18n.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsedI18n.error.issues) {
      const [loc, field] = issue.path.map(String);
      const key = `${field}_${loc}`;
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Please fix the highlighted translation fields.", fieldErrors };
  }
  const i18n = JSON.stringify(compactI18n(parsedI18n.data));

  // A published tool must go somewhere. The migration enforces this too; this
  // check exists so the admin reads a sentence, not a constraint name.
  if (t.status === "published" && !t.url) {
    return {
      error: "A published tool needs a URL.",
      fieldErrors: { url: "Required to publish." },
    };
  }

  /**
   * Create and edit are separate statements, deliberately.
   *
   * A single upsert keyed on `id` cannot tell them apart, so typing an
   * already-used ID on the Add form would silently OVERWRITE that tool --
   * every column replaced, no error, no way back from inside the app. An
   * insert surfaces the collision instead.
   *
   * On edit the id comes from the ROUTE, not the form. The form's id input is
   * readOnly, but readOnly is a client-side hint that still submits, so the
   * server ignores it rather than trusting it.
   */
  const originalId = String(formData.get("originalId") ?? "").trim();
  const isEdit = originalId.length > 0;

  try {
    if (isEdit) {
      const rows = await query<{ id: string }>(
        `update tools set
           id = $1, slug = $2, name = $3, tagline = $4, description = $5,
           category = $6, tags = $7, icon = $8, url = $9, health_url = $10,
           access = $11, access_note = $12, status = $13, sort_order = $14,
           i18n = $16
         where id = $15
         returning id`,
        [
          t.id, t.slug, t.name, t.tagline, t.description,
          t.category, t.tags, t.icon, t.url, t.healthUrl,
          t.access, t.accessNote, t.status, t.sortOrder,
          originalId, i18n,
        ]
      );
      if (rows.length === 0) {
        return { error: "That tool no longer exists. It may have been deleted." };
      }
    } else {
      await query(
        `insert into tools
           (id, slug, name, tagline, description, category, tags, icon, url,
            health_url, access, access_note, status, sort_order, i18n)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          t.id, t.slug, t.name, t.tagline, t.description,
          t.category, t.tags, t.icon, t.url, t.healthUrl,
          t.access, t.accessNote, t.status, t.sortOrder, i18n,
        ]
      );
    }
  } catch (err) {
    return mapWriteError(err);
  }

  revalidateAll();
  redirect("/admin");
}

export type DeleteState = { error?: string };

export async function deleteTool(
  _prev: DeleteState,
  formData: FormData
): Promise<DeleteState> {
  if (!(await getAdminOrNull())) redirect("/admin/login");

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "No tool specified." };

  const row = await queryOne<{ id: string }>(
    "delete from tools where id = $1 returning id",
    [id]
  );
  if (!row) return { error: "That tool no longer exists." };

  revalidateAll();
  redirect("/admin");
}
