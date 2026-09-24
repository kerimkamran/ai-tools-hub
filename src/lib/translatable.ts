import "server-only";
import { query, queryOne, type Tx } from "@/lib/db/client";
import {
  fieldStatus,
  sanitizeMeta,
  type FieldStatus,
  type I18nMeta,
  type I18nValues,
} from "@/lib/translation-status";

/**
 * Everything that carries AZ/RU translations, behind one shape, so the
 * Translations dashboard, the side-by-side editor and "Draft with AI" work
 * the same way for tools, categories, knowledge base articles and the
 * tagline (Admin Panel Plan, capability 6).
 */

export type TranslatableKind = "tool" | "category" | "kb" | "tagline";
export const KINDS: TranslatableKind[] = ["tool", "category", "kb", "tagline"];
export const KIND_LABEL: Record<TranslatableKind, string> = {
  tool: "Tools",
  category: "Categories",
  kb: "Knowledge base",
  tagline: "Tagline",
};

export type FieldDef = { key: string; label: string; multiline?: boolean; max: number; optional?: boolean };

export const FIELDS: Record<TranslatableKind, FieldDef[]> = {
  tool: [
    // Product names are often left in English, so a missing name is not a gap.
    // Same caps as src/lib/validate.ts, so a translation never breaks the
    // card the English was sized for (and the tool form still saves).
    { key: "name", label: "Name", max: 60, optional: true },
    { key: "tagline", label: "Tagline", max: 80 },
    { key: "description", label: "Description", max: 2000, multiline: true },
    { key: "accessNote", label: "Access note", max: 120 },
  ],
  category: [{ key: "label", label: "Label", max: 40 }],
  kb: [
    { key: "title", label: "Title", max: 200 },
    { key: "body", label: "Body", max: 20000, multiline: true },
  ],
  tagline: [{ key: "tagline", label: "Tagline", max: 120 }],
};

export type TranslatableItem = {
  kind: TranslatableKind;
  id: string;
  title: string;
  /** Draft items may be translated by editors; everything else needs an admin. */
  isDraft: boolean;
  english: Record<string, string>;
  values: I18nValues;
  meta: I18nMeta;
};

type Nested = Record<string, Record<string, string | undefined> | undefined>;

function flatValues(raw: unknown, keys: string[]): I18nValues {
  const src = (raw && typeof raw === "object" ? raw : {}) as Nested;
  const out: I18nValues = {};
  for (const loc of ["az", "ru"] as const) {
    const e = src[loc] ?? {};
    out[loc] = Object.fromEntries(keys.map((k) => [k, typeof e[k] === "string" ? (e[k] as string) : ""]));
  }
  return out;
}

export function compactValues(v: I18nValues): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const loc of ["az", "ru"] as const) {
    const entry = Object.fromEntries(Object.entries(v[loc] ?? {}).map(([k, s]) => [k, (s ?? "").trim()]).filter(([, s]) => s));
    if (Object.keys(entry).length) out[loc] = entry as Record<string, string>;
  }
  return out;
}

const keysOf = (kind: TranslatableKind) => FIELDS[kind].map((f) => f.key);

export async function listTranslatables(): Promise<TranslatableItem[]> {
  const [tools, cats, kb, site] = await Promise.all([
    query<{ id: string; name: string; tagline: string; description: string; access_note: string | null; status: string; i18n: unknown; i18n_meta: unknown }>(
      "select id, name, tagline, description, access_note, status, i18n, i18n_meta from tools where status <> 'archived' order by featured desc, sort_order, name"
    ),
    query<{ name: string; i18n: unknown; i18n_meta: unknown }>(
      `select c.name, c.i18n, c.i18n_meta from categories c order by c.sort_order, c.name`
    ),
    query<{ id: string; title: string; body: string; status: string; i18n: unknown; i18n_meta: unknown }>(
      "select id::text, title, body, status, i18n, i18n_meta from kb_articles order by sort_order, id"
    ),
    queryOne<{ tagline: string; tagline_i18n: unknown; i18n_meta: unknown }>(
      "select tagline, tagline_i18n, i18n_meta from site_settings where id = 1"
    ),
  ]);
  const items: TranslatableItem[] = [];
  for (const t of tools) {
    items.push({
      kind: "tool", id: t.id, title: t.name, isDraft: t.status === "draft",
      english: { name: t.name, tagline: t.tagline, description: t.description ?? "", accessNote: t.access_note ?? "" },
      values: flatValues(t.i18n, keysOf("tool")), meta: sanitizeMeta(t.i18n_meta),
    });
  }
  for (const c of cats) {
    items.push({
      kind: "category", id: c.name, title: c.name, isDraft: false,
      english: { label: c.name }, values: flatValues(c.i18n, ["label"]), meta: sanitizeMeta(c.i18n_meta),
    });
  }
  for (const a of kb) {
    items.push({
      kind: "kb", id: a.id, title: a.title, isDraft: a.status === "draft",
      english: { title: a.title, body: a.body }, values: flatValues(a.i18n, keysOf("kb")), meta: sanitizeMeta(a.i18n_meta),
    });
  }
  if (site) {
    items.push({
      kind: "tagline", id: "site", title: "Site tagline", isDraft: false,
      english: { tagline: site.tagline }, values: flatValues(site.tagline_i18n, ["tagline"]), meta: sanitizeMeta(site.i18n_meta),
    });
  }
  return items;
}

export async function getTranslatable(kind: TranslatableKind, id: string, tx?: Tx): Promise<TranslatableItem | null> {
  const q: Tx["queryOne"] = tx ? tx.queryOne : queryOne;
  const lock = tx ? " for update" : "";
  if (kind === "tool") {
    const t = await q<{ id: string; name: string; tagline: string; description: string; access_note: string | null; status: string; i18n: unknown; i18n_meta: unknown }>(
      `select id, name, tagline, description, access_note, status, i18n, i18n_meta from tools where id = $1${lock}`, [id]
    );
    return t ? {
      kind, id: t.id, title: t.name, isDraft: t.status === "draft",
      english: { name: t.name, tagline: t.tagline, description: t.description ?? "", accessNote: t.access_note ?? "" },
      values: flatValues(t.i18n, keysOf(kind)), meta: sanitizeMeta(t.i18n_meta),
    } : null;
  }
  if (kind === "category") {
    const c = await q<{ name: string; i18n: unknown; i18n_meta: unknown }>(`select name, i18n, i18n_meta from categories where name = $1${lock}`, [id]);
    return c ? { kind, id: c.name, title: c.name, isDraft: false, english: { label: c.name }, values: flatValues(c.i18n, ["label"]), meta: sanitizeMeta(c.i18n_meta) } : null;
  }
  if (kind === "kb") {
    if (!/^\d+$/.test(id)) return null;
    const a = await q<{ id: string; title: string; body: string; status: string; i18n: unknown; i18n_meta: unknown }>(
      `select id::text, title, body, status, i18n, i18n_meta from kb_articles where id = $1${lock}`, [Number(id)]
    );
    return a ? {
      kind, id: a.id, title: a.title, isDraft: a.status === "draft",
      english: { title: a.title, body: a.body }, values: flatValues(a.i18n, keysOf(kind)), meta: sanitizeMeta(a.i18n_meta),
    } : null;
  }
  if (kind === "tagline" && id === "site") {
    const s = await q<{ tagline: string; tagline_i18n: unknown; i18n_meta: unknown }>(`select tagline, tagline_i18n, i18n_meta from site_settings where id = 1${lock}`);
    return s ? { kind, id: "site", title: "Site tagline", isDraft: false, english: { tagline: s.tagline }, values: flatValues(s.tagline_i18n, ["tagline"]), meta: sanitizeMeta(s.i18n_meta) } : null;
  }
  return null;
}

export async function writeTranslatable(tx: Tx, kind: TranslatableKind, id: string, values: I18nValues, meta: I18nMeta) {
  const i18n = JSON.stringify(compactValues(values));
  const m = JSON.stringify(meta);
  if (kind === "tool") await tx.query("update tools set i18n = $2, i18n_meta = $3 where id = $1", [id, i18n, m]);
  else if (kind === "category") await tx.query("update categories set i18n = $2, i18n_meta = $3, updated_at = now() where name = $1", [id, i18n, m]);
  else if (kind === "kb") await tx.query("update kb_articles set i18n = $2, i18n_meta = $3 where id = $1", [Number(id), i18n, m]);
  else if (kind === "tagline") await tx.query("update site_settings set tagline_i18n = $1, i18n_meta = $2 where id = 1", [i18n, m]);
}

/** Status per locale per field; optional fields never count as missing. */
export function statusesOf(item: TranslatableItem): Record<"az" | "ru", Record<string, FieldStatus>> {
  const out = { az: {}, ru: {} } as Record<"az" | "ru", Record<string, FieldStatus>>;
  for (const loc of ["az", "ru"] as const) {
    for (const f of FIELDS[item.kind]) {
      let s = fieldStatus(item.english[f.key], item.values[loc]?.[f.key], item.meta[loc]?.[f.key]);
      if (f.optional && s === "missing") s = "na";
      out[loc][f.key] = s;
    }
  }
  return out;
}

export function isKind(v: string): v is TranslatableKind {
  return (KINDS as string[]).includes(v);
}
