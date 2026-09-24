"use server";

import { revalidatePath } from "next/cache";
import { transaction } from "@/lib/db/client";
import { requirePermission, type CurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { nextMeta, type I18nValues } from "@/lib/translation-status";
import { FIELDS, getTranslatable, isKind, listTranslatables, writeTranslatable, statusesOf, type TranslatableItem } from "@/lib/translatable";
import { after } from "next/server";
import { autoTranslateEnabled, autoTranslateItem } from "@/lib/auto-translate";

/**
 * Translations (capability 6). Who may translate what:
 *   tools / KB     -> translations.edit, or an editor on a DRAFT item
 *   categories     -> categories.manage
 *   tagline        -> tagline.edit (super admin)
 * Checked here per item, server-side, whatever the page showed.
 */

export type TranslationState = { error?: string; ok?: string };

function mayEdit(user: CurrentUser, item: TranslatableItem): boolean {
  switch (item.kind) {
    case "tool":
      return can(user.role, "translations.edit") || (item.isDraft && can(user.role, "catalog.draft"));
    case "kb":
      return can(user.role, "translations.edit") || (item.isDraft && can(user.role, "kb.draft"));
    case "category":
      return can(user.role, "categories.manage");
    case "tagline":
      return can(user.role, "tagline.edit");
  }
}

function refresh(kind: string, id: string) {
  revalidatePath("/", "layout");
  revalidatePath(`/admin/translations/${kind}/${encodeURIComponent(id)}`);
}

export async function saveTranslation(_prev: TranslationState, formData: FormData): Promise<TranslationState> {
  const user = await requirePermission("translations.view");
  const kind = String(formData.get("kind") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!isKind(kind)) return { error: "Unknown item." };

  const after: I18nValues = { az: {}, ru: {} };
  for (const loc of ["az", "ru"] as const) {
    for (const f of FIELDS[kind]) {
      const v = String(formData.get(`${loc}:${f.key}`) ?? "").trim();
      if (v.length > f.max) return { error: `${f.label} (${loc.toUpperCase()}) must be ${f.max} characters or fewer.` };
      after[loc]![f.key] = v;
    }
  }
  const confirm = formData
    .getAll("confirm")
    .map(String)
    .map((c) => c.split(":"))
    .filter(([loc, field]) => (loc === "az" || loc === "ru") && FIELDS[kind].some((f) => f.key === field) && after[loc as "az"]?.[field])
    .map(([loc, field]) => ({ locale: loc as "az" | "ru", field }));

  const result = await transaction(async (tx): Promise<TranslationState> => {
    const item = await getTranslatable(kind, id, tx);
    if (!item) return { error: "That item no longer exists." };
    if (!mayEdit(user, item)) return { error: "You can translate drafts only. An admin translates published content." };
    const meta = nextMeta({ english: item.english, before: item.values, after, meta: item.meta, confirm });
    await writeTranslatable(tx, kind, item.id, after, meta);
    await audit(tx, {
      actor: user.email, action: "translations.save", area: "translations", target: `${kind}:${item.id}`,
      before: item.values, after: { ...after, reviewed: confirm.map((c) => `${c.locale}:${c.field}`) },
    });
    return { ok: "Saved." };
  });
  if (!result.error) refresh(kind, id);
  return result;
}

/**
 * "Translate now" for one item: fills MISSING and STALE fields only (never
 * overwrites an up-to-date translation), the same way the automatic
 * translation after a save does, and counts against the AI budget.
 */
export async function draftWithAi(_prev: TranslationState, formData: FormData): Promise<TranslationState> {
  const user = await requirePermission("translations.view");
  const kind = String(formData.get("kind") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!isKind(kind)) return { error: "Unknown item." };
  const item = await getTranslatable(kind, id);
  if (!item) return { error: "That item no longer exists." };
  if (!mayEdit(user, item)) return { error: "You can translate drafts only. An admin translates published content." };
  const r = await autoTranslateItem(kind, id, user.email);
  if ("error" in r) return { error: r.error };
  refresh(kind, id);
  return r.filled
    ? { ok: `Translated ${r.filled} ${r.filled === 1 ? "field" : "fields"} automatically.` }
    : { ok: "Nothing to translate — every field is translated and up to date." };
}

/** Everything missing or outdated, in the background (for existing content). */
export async function translateAllMissing(_prev: TranslationState, _formData: FormData): Promise<TranslationState> {
  const user = await requirePermission("translations.edit");
  if (!(await autoTranslateEnabled())) return { error: "Automatic translation is off, or the assistant is switched off (AI → Assistant & spend)." };
  const items = (await listTranslatables()).filter((it) => {
    if (!mayEdit(user, it)) return false;
    const st = statusesOf(it);
    return (["az", "ru"] as const).some((l) => FIELDS[it.kind].some((f) => !f.optional && (st[l][f.key] === "missing" || st[l][f.key] === "stale")));
  });
  if (!items.length) return { ok: "Everything is already translated and up to date." };
  after(async () => {
    for (const it of items) {
      const r = await autoTranslateItem(it.kind, it.id, user.email).catch((e) => ({ error: String(e) }));
      if ("error" in r) {
        console.error(`[auto-translate] ${it.kind}:${it.id}: ${r.error}`);
        if (/budget|cap/i.test(r.error)) break;
      }
    }
    try {
      revalidatePath("/", "layout");
    } catch {
      // ISR picks it up within a minute
    }
  });
  return { ok: `Translating ${items.length} ${items.length === 1 ? "item" : "items"} in the background — refresh this page in a minute.` };
}
