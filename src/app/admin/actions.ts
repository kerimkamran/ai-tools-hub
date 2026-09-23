"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminOrNull } from "@/lib/auth";
import { emptyToNull, parseTags, toolInputSchema } from "@/lib/validate";

/**
 * Every mutating action re-checks the user itself. It does NOT rely on
 * middleware having run -- see src/lib/auth.ts for why.
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

  const raw = formToInput(formData);
  const parsed = toolInputSchema.safeParse(raw);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }

  const t = parsed.data;

  // A published tool must go somewhere. The database enforces this too; this
  // check exists so the admin sees a sentence instead of a constraint name.
  if (t.status === "published" && !t.url) {
    return {
      error: "A published tool needs a URL.",
      fieldErrors: { url: "Required to publish." },
    };
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("tools").upsert(
    {
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
    },
    { onConflict: "id" }
  );

  if (error) {
    if (error.code === "23505") {
      return { error: "That slug is already used by another tool.", fieldErrors: { slug: "Already taken." } };
    }
    return { error: error.message };
  }

  revalidateAll(t.slug);
  redirect("/admin");
}

export async function deleteTool(formData: FormData) {
  if (!(await getAdminOrNull())) redirect("/admin/login");

  const id = String(formData.get("id") ?? "").trim();
  if (!id) redirect("/admin");

  const supabase = createAdminClient();
  await supabase.from("tools").delete().eq("id", id);

  revalidateAll();
  redirect("/admin");
}
