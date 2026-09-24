import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { query, type Tx } from "@/lib/db/client";
import { toolI18nSchema, toolInputSchema } from "@/lib/validate";
import { brandSchema } from "@/lib/theme-validate";
import { sanitizeLook } from "@/lib/design";
import { decodeRaster } from "@/lib/raster";
import { parseSnapshot } from "@/lib/theme-store";

/**
 * Backup & restore (capability 10). The export holds CONTENT only: tools,
 * categories, the knowledge base (with history), site settings and theme
 * versions/schedules, and announcements. Never accounts, credentials, API
 * keys, the audit log, stored conversations or usage counts. Render's
 * managed Postgres backups remain the disaster-recovery layer.
 *
 * A restore is validated with the same schemas as normal saves, shown as a
 * dry-run diff, needs typed confirmation, and saves the current state first.
 */

export const BACKUP_FORMAT = "one-simple-backup";
export const BACKUP_VERSION = 1;

const TABLES = {
  tools: {
    order: "id",
    cols: "id, slug, name, tagline, description, category, tags, icon, url, health_url, access, access_note, status, sort_order, featured, i18n, i18n_meta, icon_image, maintenance_message, maintenance_i18n, maintenance_until, created_at, updated_at",
    key: "id",
  },
  categories: { order: "name", cols: "name, i18n, i18n_meta, sort_order, updated_at", key: "name" },
  kb_articles: { order: "id", cols: "id, title, body, i18n, i18n_meta, tags, status, sort_order, created_at, updated_at, updated_by", key: "id" },
  kb_article_versions: { order: "id", cols: "id, article_id, saved_at, saved_by, title, body, i18n, tags, status", key: "id" },
  theme_versions: { order: "id", cols: "id, published_at, published_by, note, snapshot", key: "id" },
  theme_schedules: { order: "id", cols: "id, name, look, starts_at, ends_at, created_by", key: "id" },
  announcements: { order: "id", cols: "id, severity, text_en, text_az, text_ru, starts_at, ends_at, created_by", key: "id" },
} as const;
type TableName = keyof typeof TABLES;
export const TABLE_LABEL: Record<TableName | "site_settings", string> = {
  tools: "Tools", categories: "Categories", kb_articles: "Knowledge base articles", kb_article_versions: "Article history",
  theme_versions: "Theme versions", theme_schedules: "Theme schedules", announcements: "Announcements", site_settings: "Site settings",
};
const SETTINGS_COLS = "brand_name, wordmark_primary, wordmark_secondary, attribution, tagline, tagline_i18n, i18n_meta, logo_url, look, colors";

export type Backup = {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  tables: Record<TableName, Record<string, unknown>[]> & { site_settings: Record<string, unknown> };
};

const norm = (v: unknown): unknown => (v instanceof Date ? v.toISOString() : v);
const normRow = (r: Record<string, unknown>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, norm(v)]));

export async function exportContent(q: Tx["query"] = query): Promise<Backup> {
  const tables = {} as Backup["tables"];
  for (const [name, t] of Object.entries(TABLES) as Array<[TableName, (typeof TABLES)[TableName]]>) {
    tables[name] = (await q<Record<string, unknown>>(`select ${t.cols} from ${name} order by ${t.order}`)).map(normRow);
  }
  const s = await q<Record<string, unknown>>(`select ${SETTINGS_COLS} from site_settings where id = 1`);
  tables.site_settings = normRow(s[0] ?? {});
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables };
}

export function fingerprint(b: Backup): string {
  return createHash("sha256").update(JSON.stringify(b.tables)).digest("hex").slice(0, 12);
}

// ---- Validation (same rules as normal saves) ---------------------------------------

const jsonObj = z.record(z.string(), z.unknown()).nullable().optional();
const isoOrNull = z.string().datetime({ offset: true }).nullable().optional();

function validateTool(r: Record<string, unknown>, i: number): string | null {
  const input = toolInputSchema.safeParse({
    id: r.id, slug: r.slug, name: r.name, tagline: r.tagline, description: r.description ?? "", category: r.category,
    tags: r.tags ?? [], icon: r.icon ?? "", url: r.url ?? "", healthUrl: r.health_url ?? null, access: r.access,
    accessNote: r.access_note ?? null, status: r.status, sortOrder: String(r.sort_order ?? 0),
  });
  if (!input.success) return `Tool #${i + 1} (${String(r.id)}): ${input.error.issues[0].path.join(".")} — ${input.error.issues[0].message}`;
  const tr = (r.i18n ?? {}) as Record<string, Record<string, string>>;
  const i18n = toolI18nSchema.safeParse({ az: { ...tr.az }, ru: { ...tr.ru } });
  if (!i18n.success) return `Tool ${String(r.id)}: a translation is too long.`;
  if (r.icon_image != null && !decodeRaster(String(r.icon_image))) return `Tool ${String(r.id)}: the logo is not a PNG/JPEG/WebP image.`;
  if (typeof r.featured !== "boolean") return `Tool ${String(r.id)}: "featured" must be true or false.`;
  if (!isoOrNull.safeParse(r.maintenance_until ?? null).success) return `Tool ${String(r.id)}: bad maintenance date.`;
  if (r.maintenance_message != null && String(r.maintenance_message).length > 200) return `Tool ${String(r.id)}: maintenance message too long.`;
  return null;
}

export function validateBackup(raw: unknown): { ok: true; backup: Backup } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const b = raw as Backup;
  if (!b || typeof b !== "object" || b.format !== BACKUP_FORMAT) return { ok: false, errors: ["This is not a One.Simple backup file."] };
  if (b.version !== BACKUP_VERSION) return { ok: false, errors: [`Unsupported backup version ${String(b.version)}.`] };
  const t = b.tables;
  if (!t || typeof t !== "object") return { ok: false, errors: ["The backup has no tables."] };
  for (const name of Object.keys(TABLES) as TableName[]) {
    if (!Array.isArray(t[name])) errors.push(`Missing table: ${name}.`);
  }
  if (errors.length) return { ok: false, errors };

  const ids = new Set<string>();
  const slugs = new Set<string>();
  t.tools.forEach((r, i) => {
    const e = validateTool(r, i);
    if (e) errors.push(e);
    if (ids.has(String(r.id))) errors.push(`Duplicate tool id ${String(r.id)}.`);
    if (slugs.has(String(r.slug))) errors.push(`Duplicate tool slug ${String(r.slug)}.`);
    ids.add(String(r.id));
    slugs.add(String(r.slug));
  });
  t.categories.forEach((c) => {
    if (typeof c.name !== "string" || !c.name.trim() || c.name.length > 40) errors.push(`Bad category name: ${String(c.name)}.`);
    if (!jsonObj.safeParse(c.i18n ?? {}).success) errors.push(`Category ${String(c.name)}: bad labels.`);
  });
  const kbIds = new Set<number>();
  t.kb_articles.forEach((a) => {
    if (!Number.isInteger(Number(a.id))) errors.push("An article has no numeric id.");
    kbIds.add(Number(a.id));
    if (typeof a.title !== "string" || !a.title.trim() || a.title.length > 200) errors.push(`Article ${String(a.id)}: bad title.`);
    if (typeof a.body !== "string" || a.body.length > 20000) errors.push(`Article ${String(a.id)}: body too long.`);
    if (a.status !== "draft" && a.status !== "published") errors.push(`Article ${String(a.id)}: bad status.`);
  });
  // History of an article that is not in the file is simply left out.
  t.kb_article_versions = t.kb_article_versions.filter((v) => kbIds.has(Number(v.article_id)));
  t.theme_versions.forEach((v) => {
    if (!parseSnapshot(v.snapshot)) errors.push(`Theme version ${String(v.id)} cannot be read.`);
  });
  t.theme_schedules.forEach((s) => {
    if (typeof s.name !== "string" || !s.name || s.name.length > 60) errors.push(`Schedule ${String(s.id)}: bad name.`);
    if (!isoOrNull.safeParse(s.starts_at).success || !isoOrNull.safeParse(s.ends_at).success) errors.push(`Schedule ${String(s.id)}: bad dates.`);
  });
  t.announcements.forEach((a) => {
    if (!["info", "warning", "critical"].includes(String(a.severity))) errors.push(`Announcement ${String(a.id)}: bad severity.`);
    if (typeof a.text_en !== "string" || !a.text_en || a.text_en.length > 240) errors.push(`Announcement ${String(a.id)}: bad text.`);
  });
  const s = t.site_settings ?? {};
  const brand = brandSchema.safeParse({
    brandName: s.brand_name, wordmarkPrimary: s.wordmark_primary, wordmarkSecondary: s.wordmark_secondary,
    attribution: s.attribution ?? "", tagline: s.tagline,
  });
  if (!brand.success) errors.push(`Site settings: ${brand.error.issues[0].path.join(".")} — ${brand.error.issues[0].message}`);
  if (s.logo_url != null && !decodeRaster(String(s.logo_url))) errors.push("Site settings: the logo is not a PNG/JPEG/WebP image.");
  if (s.look != null && JSON.stringify(sanitizeLook(s.look)) !== JSON.stringify(sanitizeLook(sanitizeLook(s.look)))) errors.push("Site settings: the look is invalid.");
  return errors.length ? { ok: false, errors: errors.slice(0, 20) } : { ok: true, backup: b };
}

// ---- Dry-run diff ---------------------------------------------------------------------------

export type TableDiff = { table: string; label: string; added: string[]; removed: string[]; changed: string[]; unchanged: number };

export function diffBackups(current: Backup, incoming: Backup): TableDiff[] {
  const out: TableDiff[] = [];
  for (const [name, t] of Object.entries(TABLES) as Array<[TableName, (typeof TABLES)[TableName]]>) {
    const cur = new Map(current.tables[name].map((r) => [String(r[t.key]), JSON.stringify(r)]));
    const inc = new Map(incoming.tables[name].map((r) => [String(r[t.key]), JSON.stringify(normRow(r))]));
    const d: TableDiff = { table: name, label: TABLE_LABEL[name], added: [], removed: [], changed: [], unchanged: 0 };
    for (const [k, v] of inc) {
      if (!cur.has(k)) d.added.push(k);
      else if (cur.get(k) !== v) d.changed.push(k);
      else d.unchanged++;
    }
    for (const k of cur.keys()) if (!inc.has(k)) d.removed.push(k);
    out.push(d);
  }
  const same = JSON.stringify(current.tables.site_settings) === JSON.stringify(normRow(incoming.tables.site_settings ?? {}));
  out.push({ table: "site_settings", label: TABLE_LABEL.site_settings, added: [], removed: [], changed: same ? [] : ["brand & theme"], unchanged: same ? 1 : 0 });
  return out;
}

// ---- Apply ------------------------------------------------------------------------------------

const J = (v: unknown) => (v === null || v === undefined ? null : typeof v === "string" ? v : JSON.stringify(v));

/** Replaces all content tables with the backup's rows, inside `tx`. */
export async function applyBackup(tx: Tx, b: Backup): Promise<void> {
  const t = b.tables;
  // Children first, then parents; ai_purposes etc. are untouched.
  for (const name of ["kb_article_versions", "kb_articles", "tools", "categories", "theme_schedules", "theme_versions", "announcements"]) {
    await tx.query(`delete from ${name}`);
  }
  for (const r of t.tools) {
    await tx.query(
      `insert into tools (id, slug, name, tagline, description, category, tags, icon, url, health_url, access, access_note,
                          status, sort_order, featured, i18n, i18n_meta, icon_image, maintenance_message, maintenance_i18n, maintenance_until,
                          created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21, coalesce($22::timestamptz, now()), coalesce($23::timestamptz, now()))`,
      [r.id, r.slug, r.name, r.tagline, r.description ?? "", r.category, r.tags ?? [], r.icon ?? "", r.url ?? "", r.health_url ?? null,
       r.access, r.access_note ?? null, r.status, r.sort_order ?? 0, r.featured ?? false, J(r.i18n ?? {}), J(r.i18n_meta ?? {}),
       r.icon_image ?? null, r.maintenance_message ?? null, J(r.maintenance_i18n ?? {}), r.maintenance_until ?? null,
       r.created_at ?? null, r.updated_at ?? null]
    );
  }
  for (const c of t.categories) {
    await tx.query(
      "insert into categories (name, i18n, i18n_meta, sort_order, updated_at) values ($1, $2, $3, $4, coalesce($5::timestamptz, now()))",
      [c.name, J(c.i18n ?? {}), J(c.i18n_meta ?? {}), c.sort_order ?? 0, c.updated_at ?? null]
    );
  }
  for (const a of t.kb_articles) {
    await tx.query(
      `insert into kb_articles (id, title, body, i18n, i18n_meta, tags, status, sort_order, created_at, updated_at, updated_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8, coalesce($9::timestamptz, now()), coalesce($10::timestamptz, now()), $11)`,
      [a.id, a.title, a.body, J(a.i18n ?? {}), J(a.i18n_meta ?? {}), a.tags ?? [], a.status, a.sort_order ?? 0, a.created_at ?? null, a.updated_at ?? null, a.updated_by ?? null]
    );
  }
  for (const v of t.kb_article_versions) {
    await tx.query(
      "insert into kb_article_versions (id, article_id, saved_at, saved_by, title, body, i18n, tags, status) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [v.id, v.article_id, v.saved_at, v.saved_by ?? null, v.title, v.body, J(v.i18n ?? {}), v.tags ?? [], v.status]
    );
  }
  for (const v of t.theme_versions) {
    await tx.query("insert into theme_versions (id, published_at, published_by, note, snapshot) values ($1,$2,$3,$4,$5)", [v.id, v.published_at, v.published_by ?? null, v.note ?? null, J(v.snapshot)]);
  }
  for (const s of t.theme_schedules) {
    await tx.query("insert into theme_schedules (id, name, look, starts_at, ends_at, created_by) values ($1,$2,$3,$4,$5,$6)", [s.id, s.name, J(sanitizeLook(s.look)), s.starts_at, s.ends_at, s.created_by ?? null]);
  }
  for (const a of t.announcements) {
    await tx.query(
      "insert into announcements (id, severity, text_en, text_az, text_ru, starts_at, ends_at, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8)",
      [a.id, a.severity, a.text_en, a.text_az ?? "", a.text_ru ?? "", a.starts_at, a.ends_at ?? null, a.created_by ?? null]
    );
  }
  const s = t.site_settings;
  await tx.query(
    `update site_settings set brand_name = $1, wordmark_primary = $2, wordmark_secondary = $3, attribution = $4, tagline = $5,
       tagline_i18n = $6, i18n_meta = $7, logo_url = $8, look = $9, colors = $10, theme_draft = null, updated_at = now() where id = 1`,
    [s.brand_name, s.wordmark_primary, s.wordmark_secondary, s.attribution ?? "", s.tagline, J(s.tagline_i18n ?? {}), J(s.i18n_meta ?? {}),
     s.logo_url ?? null, J(s.look ? sanitizeLook(s.look) : null), J(s.colors ?? {})]
  );
  // Keep id sequences ahead of the restored ids.
  for (const name of ["kb_articles", "kb_article_versions", "theme_versions", "theme_schedules", "announcements"]) {
    await tx.query(`select setval(pg_get_serial_sequence('${name}', 'id'), greatest((select coalesce(max(id), 0) from ${name}), 1))`);
  }
}
