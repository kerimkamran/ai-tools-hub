"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { transaction, type Tx } from "@/lib/db/client";
import { requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { scheduleAutoTranslate } from "@/lib/auto-translate";
import { nextMeta, sanitizeMeta, type I18nValues } from "@/lib/translation-status";

export type CategoriesState = { error?: string; ok?: boolean };

const label = z.string().trim().max(40);

/**
 * Saves AZ/RU labels for every category in one submit. The English name is
 * the key and is never changed here -- renaming a category is done on the
 * tools themselves, which keeps the filter key and the stored labels in step.
 */
export async function saveCategories(
  _prev: CategoriesState,
  formData: FormData
): Promise<CategoriesState> {
  const user = await requirePermission("categories.manage");

  const names = formData.getAll("name").map((n) => String(n).trim()).filter(Boolean);
  if (names.length > 200) return { error: "Too many categories in one save." };

  const rows: Array<{ name: string; i18n: Record<string, { label: string }> }> = [];
  for (const name of names) {
    if (name.length > 40) return { error: `Category name too long: ${name.slice(0, 40)}…` };
    const az = label.safeParse(formData.get(`az:${name}`) ?? "");
    const ru = label.safeParse(formData.get(`ru:${name}`) ?? "");
    if (!az.success || !ru.success) return { error: `Labels for “${name}” must be 40 characters or fewer.` };
    const i18n: Record<string, { label: string }> = {};
    if (az.data) i18n.az = { label: az.data };
    if (ru.data) i18n.ru = { label: ru.data };
    rows.push({ name, i18n });
  }

  await transaction(async (tx) => {
    const before = await tx.query<{ name: string; i18n: Record<string, { label?: string }>; i18n_meta: unknown }>(
      "select name, i18n, i18n_meta from categories order by name"
    );
    const byName = new Map(before.map((b) => [b.name, b]));
    for (const r of rows) {
      const prev = byName.get(r.name);
      const flat = (v: Record<string, { label?: string }> | undefined): I18nValues => ({
        az: { label: v?.az?.label ?? "" },
        ru: { label: v?.ru?.label ?? "" },
      });
      // Provenance for stale detection: a label changed here is recorded
      // against the English name as it is now.
      const meta = nextMeta({ english: { label: r.name }, before: flat(prev?.i18n), after: flat(r.i18n), meta: sanitizeMeta(prev?.i18n_meta) });
      await tx.query(
        `insert into categories (name, i18n, i18n_meta, updated_at) values ($1, $2, $3, now())
         on conflict (name) do update set i18n = excluded.i18n, i18n_meta = excluded.i18n_meta, updated_at = now()`,
        [r.name, JSON.stringify(r.i18n), JSON.stringify(meta)]
      );
    }
    await audit(tx, {
      actor: user.email, action: "categories.labels", area: "categories", target: `${rows.length} categories`,
      before: Object.fromEntries(before.map((b) => [b.name, b.i18n])),
      after: Object.fromEntries(rows.map((r) => [r.name, r.i18n])),
    });
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

// ---- Create / rename / merge / reorder / delete (capability 5) ----------------

const nameSchema = z.string().trim().min(1, "Enter a name.").max(40, "40 characters or fewer.");

export type CategoryOpState = { error?: string; ok?: string };

/** Make sure every category a tool uses has a row, so it can be ordered. */
async function ensureRows(tx: Tx) {
  await tx.query(
    `insert into categories (name, i18n, sort_order)
     select distinct t.category, '{}'::jsonb, 9999 from tools t
      where not exists (select 1 from categories c where c.name = t.category)`
  );
}

/**
 * Renaming or merging moves every tool in the SAME transaction as the
 * category row, so the public filter never points at a name no tool has.
 */
export async function categoryAction(_prev: CategoryOpState, formData: FormData): Promise<CategoryOpState> {
  const user = await requirePermission("categories.manage");
  const op = String(formData.get("op") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  const result = await transaction(async (tx): Promise<CategoryOpState> => {
    await ensureRows(tx);

    if (op === "create") {
      const n = nameSchema.safeParse(formData.get("newName") ?? "");
      if (!n.success) return { error: n.error.issues[0].message };
      const exists = await tx.queryOne("select 1 from categories where lower(name) = lower($1)", [n.data]);
      if (exists) return { error: `“${n.data}” already exists.` };
      const max = await tx.queryOne<{ m: number }>("select coalesce(max(sort_order) filter (where sort_order < 9999), 0) as m from categories");
      await tx.query("insert into categories (name, i18n, sort_order) values ($1, '{}'::jsonb, $2)", [n.data, (max?.m ?? 0) + 10]);
      await audit(tx, { actor: user.email, action: "categories.create", area: "categories", target: n.data });
      return { ok: `“${n.data}” created. Pick it on a tool to use it.` };
    }

    const row = await tx.queryOne<{ name: string; i18n: unknown; i18n_meta: unknown; sort_order: number }>(
      "select name, i18n, i18n_meta, sort_order from categories where name = $1 for update",
      [name]
    );
    if (!row) return { error: "That category no longer exists." };

    if (op === "rename") {
      const n = nameSchema.safeParse(formData.get("newName") ?? "");
      if (!n.success) return { error: n.error.issues[0].message };
      if (n.data === name) return { ok: "Nothing changed." };
      const clash = await tx.queryOne("select 1 from categories where lower(name) = lower($1) and name <> $2", [n.data, name]);
      if (clash) return { error: `“${n.data}” already exists — use Merge instead.` };
      const moved = await tx.query("update tools set category = $2 where category = $1 returning id", [name, n.data]);
      await tx.query("update categories set name = $2, updated_at = now() where name = $1", [name, n.data]);
      await audit(tx, { actor: user.email, action: "categories.rename", area: "categories", target: n.data, before: { name }, after: { name: n.data, tools: moved.length } });
      return { ok: `Renamed to “${n.data}” on ${moved.length} ${moved.length === 1 ? "tool" : "tools"}. Its translations now need a check.` };
    }

    if (op === "merge") {
      const into = String(formData.get("into") ?? "").trim();
      const confirm = String(formData.get("confirm") ?? "").trim();
      if (!into || into === name) return { error: "Choose a different category to merge into." };
      if (confirm.toLowerCase() !== name.toLowerCase()) return { error: `Type ${name} to confirm the merge.` };
      const target = await tx.queryOne("select 1 from categories where name = $1", [into]);
      if (!target) return { error: "The target category no longer exists." };
      const moved = await tx.query("update tools set category = $2 where category = $1 returning id", [name, into]);
      await tx.query("delete from categories where name = $1", [name]);
      await audit(tx, { actor: user.email, action: "categories.merge", area: "categories", target: into, before: { name, i18n: row.i18n }, after: { into, tools: moved.length } });
      return { ok: `Merged “${name}” into “${into}” (${moved.length} ${moved.length === 1 ? "tool" : "tools"} moved).` };
    }

    if (op === "delete") {
      const used = await tx.queryOne<{ n: number }>("select count(*)::int as n from tools where category = $1", [name]);
      if ((used?.n ?? 0) > 0) return { error: "Only an unused category can be deleted. Merge it instead." };
      await tx.query("delete from categories where name = $1", [name]);
      await audit(tx, { actor: user.email, action: "categories.delete", area: "categories", target: name, before: row });
      return { ok: `“${name}” deleted.` };
    }

    if (op === "up" || op === "down") {
      const all = await tx.query<{ name: string }>("select name from categories order by sort_order, name");
      const i = all.findIndex((c) => c.name === name);
      const j = op === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= all.length) return { ok: "Already at the edge." };
      [all[i], all[j]] = [all[j], all[i]];
      for (let k = 0; k < all.length; k++) {
        await tx.query("update categories set sort_order = $2 where name = $1", [all[k].name, (k + 1) * 10]);
      }
      await audit(tx, { actor: user.email, action: "categories.reorder", area: "categories", target: name, after: { order: all.map((c) => c.name) } });
      return { ok: "Order saved." };
    }

    return { error: "Unknown action." };
  });

  if (!result.error) {
    revalidatePath("/", "layout");
    const renamed = op === "rename" || op === "create" ? String(formData.get("newName") ?? "").trim() : null;
    if (renamed) scheduleAutoTranslate("category", renamed, user.email);
  }
  return result;
}
