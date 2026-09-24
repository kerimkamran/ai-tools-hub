"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { transaction, type Tx } from "@/lib/db/client";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { scheduleAutoTranslate } from "@/lib/auto-translate";
import { parseTags } from "@/lib/validate";
import { nextMeta, sanitizeMeta, type I18nValues } from "@/lib/translation-status";

/**
 * Knowledge base writes. Admins edit anything; editors create and edit
 * DRAFTS only (enforced here, whatever the form sent). Audited in the same
 * transaction.
 */

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
  const admin = await requirePermission("kb.draft");
  const full = can(admin.role, "kb.edit");

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

  // English-only editing: without AZ/RU fields in the form, the stored
  // translations are kept and refreshed automatically after the save.
  const sendsTranslations = formData.has("title_az") || formData.has("title_ru");
  let i18n: Record<string, Record<string, string>> = {};
  for (const loc of ["az", "ru"] as const) {
    const entry = Object.fromEntries(Object.entries(a[loc]).filter(([, v]) => v.length > 0));
    if (Object.keys(entry).length) i18n[loc] = entry;
  }

  const idRaw = String(formData.get("id") ?? "").trim();
  const id = idRaw ? Number(idRaw) : null;

  if (!full && a.status !== "draft") return { error: "Editors can only save drafts. An admin publishes." };

  const cols = "id, title, body, i18n, tags, status, sort_order";
  const english = { title: a.title, body: a.body };
  let afterValues: I18nValues = { az: a.az, ru: a.ru };

  let savedId: number | null = id;
  const result = await transaction(async (tx) => {
    if (id) {
      const before = await tx.queryOne<Record<string, unknown>>(`select ${cols} from kb_articles where id = $1`, [id]);
      if (!before) return "That article no longer exists.";
      if (!full && before.status !== "draft") return "Editors cannot edit a published article.";
      if (!sendsTranslations) {
        i18n = (before.i18n ?? {}) as typeof i18n;
        afterValues = flat(before.i18n);
      }
      const metaRow = await tx.queryOne<{ m: unknown }>("select i18n_meta as m from kb_articles where id = $1", [id]);
      const meta = nextMeta({ english, before: flat(before.i18n), after: afterValues, meta: sanitizeMeta(metaRow?.m) });
      await tx.query(
        `update kb_articles set title = $1, body = $2, i18n = $3, tags = $4, status = $5,
           sort_order = $6, updated_by = $7, i18n_meta = $9 where id = $8`,
        [a.title, a.body, JSON.stringify(i18n), a.tags, a.status, a.sortOrder, admin.email, id, JSON.stringify(meta)]
      );
      await snapshotVersion(tx, id, admin.email);
      const after = await tx.queryOne(`select ${cols} from kb_articles where id = $1`, [id]);
      await audit(tx, { actor: admin.email, action: "kb.edit", area: "kb", target: String(id), before, after });
    } else {
      const created = await tx.queryOne<{ id: string }>(
        `insert into kb_articles (title, body, i18n, tags, status, sort_order, updated_by, i18n_meta)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning id::text`,
        [a.title, a.body, JSON.stringify(i18n), a.tags, a.status, a.sortOrder, admin.email,
         JSON.stringify(nextMeta({ english, before: {}, after: afterValues, meta: {} }))]
      );
      await snapshotVersion(tx, Number(created?.id), admin.email);
      savedId = Number(created?.id);
      const after = await tx.queryOne(`select ${cols} from kb_articles where id = $1`, [created?.id]);
      await audit(tx, { actor: admin.email, action: "kb.create", area: "kb", target: created?.id ?? null, after });
    }
    return null;
  });
  if (result) return { error: result };

  revalidatePath("/admin/kb");
  if (savedId) scheduleAutoTranslate("kb", String(savedId), admin.email);
  redirect("/admin/kb");
}

export async function deleteArticle(_prev: KbState, formData: FormData): Promise<KbState> {
  const admin = await requirePermission("kb.edit");
  const id = Number(String(formData.get("id") ?? ""));
  const confirm = String(formData.get("confirm") ?? "").trim().toLowerCase();
  if (!id) return { error: "No article specified." };
  const error = await transaction(async (tx) => {
    const row = await tx.queryOne<{ title: string }>("select title from kb_articles where id = $1", [id]);
    if (!row) return "That article no longer exists.";
    if (confirm !== "delete") return "Type delete to confirm.";
    const before = await tx.queryOne("delete from kb_articles where id = $1 returning id, title, status", [id]);
    await tx.query("delete from kb_article_versions where article_id = $1", [id]);
    await audit(tx, { actor: admin.email, action: "kb.delete", area: "kb", target: String(id), before });
    return null;
  });
  if (error) return { error };
  revalidatePath("/admin/kb");
  redirect("/admin/kb");
}

const KEEP_VERSIONS = 50;

/** Every save leaves a version (the state AFTER the save); the oldest beyond 50 go. */
async function snapshotVersion(tx: Tx, id: number, by: string) {
  await tx.query(
    `insert into kb_article_versions (article_id, saved_by, title, body, i18n, tags, status)
     select id, $2, title, body, i18n, tags, status from kb_articles where id = $1`,
    [id, by]
  );
  await tx.query(
    `delete from kb_article_versions where article_id = $1 and id not in
       (select id from kb_article_versions where article_id = $1 order by saved_at desc, id desc limit $2)`,
    [id, KEEP_VERSIONS]
  );
}

/**
 * One-click restore. The restored text becomes a NEW save (and a new
 * version), so restoring is itself undoable. An editor restoring a draft
 * keeps it a draft.
 */
export async function restoreVersion(_prev: KbState, formData: FormData): Promise<KbState> {
  const admin = await requirePermission("kb.draft");
  const full = can(admin.role, "kb.edit");
  const versionId = Number(String(formData.get("versionId") ?? ""));
  if (!versionId) return { error: "No version specified." };
  const result = await transaction(async (tx): Promise<KbState> => {
    const v = await tx.queryOne<{ article_id: string; title: string; body: string; i18n: unknown; tags: string[]; status: string }>(
      "select article_id::text, title, body, i18n, tags, status from kb_article_versions where id = $1",
      [versionId]
    );
    if (!v) return { error: "That version no longer exists." };
    const before = await tx.queryOne<Record<string, unknown>>(
      "select id, title, body, i18n, i18n_meta, tags, status from kb_articles where id = $1 for update",
      [Number(v.article_id)]
    );
    if (!before) return { error: "The article was deleted." };
    if (!full && before.status !== "draft") return { error: "Editors can restore drafts only." };
    const status = full ? v.status : "draft";
    const meta = nextMeta({
      english: { title: v.title, body: v.body },
      before: flat(before.i18n),
      after: flat(v.i18n),
      meta: sanitizeMeta(before.i18n_meta),
    });
    await tx.query(
      "update kb_articles set title = $2, body = $3, i18n = $4, tags = $5, status = $6, i18n_meta = $7, updated_by = $8 where id = $1",
      [Number(v.article_id), v.title, v.body, JSON.stringify(v.i18n ?? {}), v.tags, status, JSON.stringify(meta), admin.email]
    );
    await snapshotVersion(tx, Number(v.article_id), admin.email);
    await audit(tx, { actor: admin.email, action: "kb.restore", area: "kb", target: v.article_id, before, after: { versionId, title: v.title, status } });
    return {};
  });
  if (result.error) return result;
  revalidatePath("/admin/kb");
  redirect(`/admin/kb/${Number(String(formData.get("articleId") ?? "")) || ""}`);
}

function flat(v: unknown): I18nValues {
  const o = (v ?? {}) as Record<string, Record<string, string>>;
  return { az: { title: o.az?.title ?? "", body: o.az?.body ?? "" }, ru: { title: o.ru?.title ?? "", body: o.ru?.body ?? "" } };
}
