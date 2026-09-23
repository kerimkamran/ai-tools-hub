"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminOrNull } from "@/lib/auth";
import { emptyToNull, parseTags, toolInputSchema } from "@/lib/validate";

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

function revalidateAll(slug?: string) {
  revalidatePath("/");
  revalidatePath("/sitemap.xml");
  revalidatePath("/admin");
  if (slug) revalidatePath(`/tools/${slug}`);
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

  // A published tool must go somewhere. The migration enforces this too; this
  // check exists so the admin reads a sentence, not a constraint name.
  if (t.status === "published" && !t.url) {
    return {
      error: "A published tool needs a URL.",
      fieldErrors: { url: "Required to publish." },
    };
  }

  const row = {
    id: t.id,
    slug: t.slug,
    name: t.name,
    tagline: t.tagline,
    description: t.description,
    category: t.category,
    tags: t.tags,
    icon: t.icon,
    url: t.url,
    health_url: t.healthUrl,
    access: t.access,
    access_note: t.accessNote,
    status: t.status,
    sort_order: t.sortOrder,
  };

  const supabase = createAdminClient();

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

  if (isEdit) {
    const { data, error } = await supabase
      .from("tools")
      .update(row)
      .eq("id", originalId)
      .select("id");
    if (error) return mapWriteError(error);
    if (!data || data.length === 0) {
      return { error: "That tool no longer exists. It may have been deleted." };
    }
  } else {
    const { error } = await supabase.from("tools").insert(row);
    if (error) return mapWriteError(error);
  }

  revalidateAll(t.slug);
  redirect("/admin");
}

function mapWriteError(error: { code?: string; message: string }): ActionState {
  if (error.code === "23505") {
    // Which unique index tripped? The message names the constraint.
    if (error.message.includes("pkey")) {
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
  if (error.code === "23514") {
    return { error: "A published tool needs a URL.", fieldErrors: { url: "Required to publish." } };
  }
  return { error: error.message };
}

export type DeleteState = { error?: string };

export async function deleteTool(
  _prev: DeleteState,
  formData: FormData
): Promise<DeleteState> {
  if (!(await getAdminOrNull())) redirect("/admin/login");

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "No tool specified." };

  const supabase = createAdminClient();
  // Errors here were previously discarded, so a failed delete reported success
  // and the row silently stayed in the catalog.
  const { data, error } = await supabase.from("tools").delete().eq("id", id).select("id");
  if (error) return { error: `Could not delete: ${error.message}` };
  if (!data || data.length === 0) return { error: "That tool no longer exists." };

  revalidateAll();
  redirect("/admin");
}
