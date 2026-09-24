"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { query, queryOne } from "@/lib/db/client";
import { getAdminOrNull } from "@/lib/auth";
import { parseTags } from "@/lib/validate";

/** Knowledge base writes. Any admin (not only super admins) may edit it. */

export type KbState = { error?: string; fieldErrors?: Record<string, string> };

const translation = z.object({
  title: z.string().trim().max(200).default(""),
  body: z.string().trim().max(20000).default(""),
});

const schema = z.object({
  title: z.string().trim().min(1, "Required.").max(200),
  body: z.string().trim().max(20000),
  az: translation,
  ru: translation,
  tags: z.array(z.string().trim().min(1).max(30)).max(12),
  status: z.enum(["draft", "published"]),
  sortOrder: z.coerce.number().int().min(0).max(9999),
});

export async function saveArticle(_prev: KbState, formData: FormData): Promise<KbState> {
  const admin = await getAdminOrNull();
  if (!admin) return { error: "Not signed in." };

  const parsed = schema.safeParse({
    title: formData.get("title") ?? "",
    body: formData.get("body") ?? "",
    az: { title: formData.get("title_az") ?? "", body: formData.get("body_az") ?? "" },
    ru: { title: formData.get("title_ru") ?? "", body: formData.get("body_ru") ?? "" },
    tags: parseTags(formData.get("tags")),
    status: formData.get("status") ?? "draft",
    sortOrder: formData.get("sortOrder") ?? "0",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.map(String);
      const key = path.length === 2 ? `${path[1]}_${path[0]}` : path[0];
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }
  const a = parsed.data;

  const i18n: Record<string, Record<string, string>> = {};
  for (const loc of ["az", "ru"] as const) {
    const entry = Object.fromEntries(Object.entries(a[loc]).filter(([, v]) => v.length > 0));
    if (Object.keys(entry).length) i18n[loc] = entry;
  }

  const idRaw = String(formData.get("id") ?? "").trim();
  const id = idRaw ? Number(idRaw) : null;

  if (id) {
    const row = await queryOne<{ id: string }>(
      `update kb_articles set title = $1, body = $2, i18n = $3, tags = $4, status = $5,
         sort_order = $6, updated_by = $7
       where id = $8 returning id::text`,
      [a.title, a.body, JSON.stringify(i18n), a.tags, a.status, a.sortOrder, admin.email, id]
    );
    if (!row) return { error: "That article no longer exists." };
  } else {
    await query(
      `insert into kb_articles (title, body, i18n, tags, status, sort_order, updated_by)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [a.title, a.body, JSON.stringify(i18n), a.tags, a.status, a.sortOrder, admin.email]
    );
  }

  revalidatePath("/admin/kb");
  redirect("/admin/kb");
}

export async function deleteArticle(formData: FormData): Promise<void> {
  if (!(await getAdminOrNull())) redirect("/admin/login");
  const id = Number(String(formData.get("id") ?? ""));
  if (id) await query("delete from kb_articles where id = $1", [id]);
  revalidatePath("/admin/kb");
  redirect("/admin/kb");
}
