"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { transaction, type Tx } from "@/lib/db/client";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { scheduleAutoTranslate, scheduleTranslateTexts } from "@/lib/auto-translate";
import { readRaster } from "@/lib/raster";
import { TOOL_ICON_MAX_BYTES } from "@/lib/tool-icons";
import { nextMeta, sanitizeMeta, type I18nValues } from "@/lib/translation-status";
import { compactI18n, emptyToNull, parseTags, toolI18nSchema, toolInputSchema } from "@/lib/validate";

/**
 * Every mutating action re-checks the user itself via requirePermission()
 * -- it does NOT rely on the proxy having run -- and writes its audit row in
 * the same transaction as the change.
 *
 * Editors (catalog.draft without catalog.edit) may create and edit DRAFTS
 * only: they cannot set any other status and cannot touch a tool that is
 * already anything but a draft. That is enforced here, server-side, so a
 * crafted request is refused whatever the form showed.
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
  const user = await requirePermission("catalog.draft");
  const fullEditor = can(user.role, "catalog.edit");

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
  // English-only editing: the tool form no longer sends AZ/RU fields, so the
  // stored translations are kept (and re-translated automatically when the
  // English changed). A form that does send them still works.
  const sendsTranslations = formData.has("tagline_az") || formData.has("tagline_ru");
  let i18nObj = compactI18n(parsedI18n.data);
  let i18n = JSON.stringify(i18nObj);
  const english = { name: t.name, tagline: t.tagline, description: t.description, accessNote: t.accessNote ?? "" };
  // Record which English each changed translation was written against, so a
  // later English-only edit flags it stale (src/lib/translation-status.ts).
  const writeMeta = async (tx: Tx, id: string, beforeI18n: unknown, beforeMeta: unknown) => {
    const meta = nextMeta({
      english,
      before: (beforeI18n ?? {}) as I18nValues,
      after: i18nObj as I18nValues,
      meta: sanitizeMeta(beforeMeta),
    });
    await tx.query("update tools set i18n_meta = $2 where id = $1", [id, JSON.stringify(meta)]);
  };

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

  if (!fullEditor && t.status !== "draft") {
    return { error: "Editors can only save drafts. An admin publishes.", fieldErrors: { status: "Drafts only." } };
  }

  // Optional logo upload (tool branding). Validated before any write.
  let iconImage: string | null | undefined; // undefined = unchanged
  const iconFile = formData.get("iconImage");
  if (formData.get("removeIconImage") === "on") iconImage = null;
  else if (iconFile instanceof File && iconFile.size > 0) {
    const r = await readRaster(iconFile, TOOL_ICON_MAX_BYTES);
    if ("error" in r) return { error: r.error, fieldErrors: { iconImage: r.error } };
    iconImage = r.dataUrl;
  }

  type Snap = Record<string, unknown> | null;
  const snap = (tx: Tx, id: string) =>
    tx.queryOne<Record<string, unknown>>(
      `select id, slug, name, tagline, description, category, tags, icon, url, health_url,
              access, access_note, status, sort_order, i18n from tools where id = $1`,
      [id]
    );

  try {
    const outcome = await transaction(async (tx): Promise<ActionState | null> => {
    if (isEdit) {
      const before: Snap = await snap(tx, originalId);
      if (!before) return { error: "That tool no longer exists. It may have been deleted." };
      const beforeMeta = await tx.queryOne<{ m: unknown }>("select i18n_meta as m from tools where id = $1", [originalId]);
      if (!sendsTranslations) {
        i18nObj = (before.i18n ?? {}) as typeof i18nObj;
        i18n = JSON.stringify(i18nObj);
      }
      if (!fullEditor && before.status !== "draft") {
        return { error: "Editors cannot edit a tool that is already published, planned, unlisted or archived." };
      }
      const rows = await tx.query<{ id: string }>(
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
      await writeMeta(tx, t.id, before.i18n, beforeMeta?.m);
      await audit(tx, {
        actor: user.email,
        action: before.status !== t.status ? `catalog.status_${t.status}` : "catalog.edit",
        area: "catalog",
        target: t.id,
        before,
        after: await snap(tx, t.id),
      });
    } else {
      await tx.query(
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
      await writeMeta(tx, t.id, {}, {});
      await audit(tx, { actor: user.email, action: "catalog.create", area: "catalog", target: t.id, after: await snap(tx, t.id) });
    }
    if (iconImage !== undefined) {
      await tx.query("update tools set icon_image = $2 where id = $1", [t.id, iconImage]);
      await audit(tx, { actor: user.email, action: iconImage ? "catalog.icon_upload" : "catalog.icon_remove", area: "catalog", target: t.id, after: { bytes: iconImage?.length ?? 0 } });
    }
    return null;
    });
    if (outcome) return outcome;
  } catch (err) {
    return mapWriteError(err);
  }

  revalidateAll();
  scheduleAutoTranslate("tool", parsed.data.id, user.email);
  redirect("/admin");
}

// ---- Catalog lifecycle (capability 5) ------------------------------------------

export type CatalogState = { error?: string; ok?: string };

const LIFECYCLE: Record<string, "published" | "unlisted" | "archived" | "draft" | "planned"> = {
  publish: "published",
  unlist: "unlisted",
  archive: "archived",
  to_draft: "draft",
  plan: "planned",
};

/**
 * One action for every row operation in the catalog's ⋯ menu. Duplicate
 * only creates a DRAFT, so editors may use it (catalog.draft); everything
 * else changes what the public sees and needs catalog.edit.
 */
export async function catalogAction(_prev: CatalogState, formData: FormData): Promise<CatalogState> {
  const op = String(formData.get("op") ?? "");
  const user = await requirePermission(op === "duplicate" ? "catalog.draft" : "catalog.edit");
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "No tool specified." };

  if (op === "check_health") {
    const { manualCooldownLeft, probeUrl, HEALTH_LABEL } = await import("@/lib/health");
    const tool = await transaction((tx) =>
      tx.queryOne<{ health_url: string | null }>("select health_url from tools where id = $1", [id])
    );
    if (!tool) return { error: "That tool no longer exists." };
    if (!tool.health_url) return { error: "This tool has no health URL." };
    const wait = await manualCooldownLeft(id);
    if (wait > 0) return { error: `Checked recently. Try again in ${wait} min — every check wakes the tool's server.` };
    const r = await probeUrl(tool.health_url);
    if (!r) return { error: "The stored health URL is not a public https address." };
    await transaction(async (tx) => {
      await tx.query(
        "insert into tool_health (tool_id, outcome, duration_ms, trigger) values ($1, $2, $3, 'manual')",
        [id, r.outcome, r.durationMs]
      );
      await audit(tx, { actor: user.email, action: "catalog.health_check", area: "catalog", target: id, after: r });
    });
    revalidatePath("/admin");
    return { ok: `${HEALTH_LABEL[r.outcome]} · ${r.durationMs} ms` };
  }

  let pendingTranslation: { id: string; message: string } | null = null;
  try {
    const result = await transaction(async (tx): Promise<CatalogState> => {
      const before = await tx.queryOne<Record<string, unknown>>("select * from tools where id = $1 for update", [id]);
      if (!before) return { error: "That tool no longer exists." };

      if (op in LIFECYCLE) {
        const status = LIFECYCLE[op];
        if (status === "published" && !before.url) return { error: "Add a URL before publishing." };
        if (before.status === status) return { ok: `Already ${STATUS_WORD[status]}.` };
        await tx.query("update tools set status = $2 where id = $1", [id, status]);
        await audit(tx, { actor: user.email, action: `catalog.status_${status}`, area: "catalog", target: id, before: { status: before.status }, after: { status } });
        return { ok: `${String(before.name)} is now ${STATUS_WORD[status]}.` };
      }

      if (op === "feature" || op === "unfeature") {
        const featured = op === "feature";
        await tx.query("update tools set featured = $2 where id = $1", [id, featured]);
        await audit(tx, { actor: user.email, action: `catalog.${op}`, area: "catalog", target: id, before: { featured: before.featured }, after: { featured } });
        return { ok: featured ? "Pinned to the top of the catalog." : "No longer featured." };
      }

      if (op === "up" || op === "down") {
        const rows = await tx.query<{ id: string; featured: boolean }>(
          "select id, featured from tools order by featured desc, sort_order, name"
        );
        const i = rows.findIndex((r) => r.id === id);
        const j = op === "up" ? i - 1 : i + 1;
        // Featured tools always sort first, so moving stays within one group.
        if (j < 0 || j >= rows.length || rows[j].featured !== rows[i].featured) return { ok: "Already at the edge." };
        [rows[i], rows[j]] = [rows[j], rows[i]];
        for (let k = 0; k < rows.length; k++) {
          await tx.query("update tools set sort_order = $2 where id = $1", [rows[k].id, (k + 1) * 10]);
        }
        await audit(tx, { actor: user.email, action: "catalog.reorder", area: "catalog", target: id, after: { order: rows.map((r) => r.id) } });
        return { ok: "Order saved." };
      }

      if (op === "duplicate") {
        let n = 1;
        let newId = `${id}-copy`;
        while (await tx.queryOne("select 1 from tools where id = $1 or slug = $1", [newId])) newId = `${id}-copy-${++n}`;
        await tx.query(
          `insert into tools (id, slug, name, tagline, description, category, tags, icon, url, health_url,
                              access, access_note, status, sort_order, featured, i18n, i18n_meta, icon_image)
           select $2, $2, name || ' (copy)', tagline, description, category, tags, icon, url, health_url,
                  access, access_note, 'draft', sort_order + 1, false, i18n, i18n_meta, icon_image
             from tools where id = $1`,
          [id, newId]
        );
        await audit(tx, { actor: user.email, action: "catalog.duplicate", area: "catalog", target: newId, before: { from: id } });
        return { ok: `Draft "${newId}" created.` };
      }

      if (op === "maintenance") {
        const message = String(formData.get("message") ?? "").trim();
        const untilRaw = String(formData.get("until") ?? "").trim();
        if (!message || message.length > 200) return { error: "Write a short message (200 characters or fewer)." };
        let until: Date | null = null;
        if (untilRaw) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(untilRaw)) return { error: "Choose an end date." };
          until = new Date(`${untilRaw}T00:00:00+04:00`);
          until.setUTCDate(until.getUTCDate() + 1); // through the end of that Baku day
          if (until.getTime() <= Date.now()) return { error: "The end date must be in the future." };
        }
        await tx.query(
          "update tools set maintenance_message = $2, maintenance_i18n = '{}'::jsonb, maintenance_until = $3 where id = $1",
          [id, message, until ? until.toISOString() : null]
        );
        await audit(tx, { actor: user.email, action: "catalog.maintenance_on", area: "catalog", target: id, after: { message, until } });
        pendingTranslation = { id, message };
        return { ok: `Maintenance on${until ? ` until ${untilRaw}` : ""}. The health dot is replaced and the tool is not probed.` };
      }

      if (op === "end_maintenance") {
        await tx.query("update tools set maintenance_message = null, maintenance_i18n = '{}'::jsonb, maintenance_until = null where id = $1", [id]);
        await audit(tx, { actor: user.email, action: "catalog.maintenance_off", area: "catalog", target: id });
        return { ok: "Maintenance ended." };
      }

      if (op === "delete") {
        const confirm = String(formData.get("confirm") ?? "").trim().toLowerCase();
        if (confirm !== id.toLowerCase()) return { error: `Type ${id} to delete this tool.` };
        await tx.query("delete from tools where id = $1", [id]);
        await tx.query("delete from tool_health where tool_id = $1", [id]);
        await audit(tx, { actor: user.email, action: "catalog.delete", area: "catalog", target: id, before });
        return { ok: `${String(before.name)} deleted.` };
      }

      return { error: "Unknown action." };
    });
    if (!result.error) revalidateAll();
    const pt = pendingTranslation as { id: string; message: string } | null;
    if (!result.error && pt) {
      // English-only: the maintenance message is translated in the background.
      scheduleTranslateTexts(user.email, { message: pt.message }, { message: 200 }, async (out) => {
        await transaction((tx2) =>
          tx2.query("update tools set maintenance_i18n = $2 where id = $1 and maintenance_message = $3", [
            pt.id, JSON.stringify({ az: out.az.message ?? "", ru: out.ru.message ?? "" }), pt.message,
          ])
        );
      });
    }
    return result;
  } catch (err) {
    return mapWriteError(err);
  }
}

const STATUS_WORD: Record<string, string> = {
  published: "published",
  unlisted: "unlisted (link only)",
  archived: "archived",
  draft: "a draft",
  planned: "planned",
};
