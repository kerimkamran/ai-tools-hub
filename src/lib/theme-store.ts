import "server-only";
import { query, queryOne, type Tx } from "@/lib/db/client";
import { sanitizeLook, type Look } from "@/lib/design";
import { brandSchema, type Brand } from "@/lib/theme-validate";
import { nextMeta, sanitizeMeta } from "@/lib/translation-status";

/**
 * Design Studio storage (capability 9): live theme, draft, versions and
 * schedules. The admin pages read the LIVE row directly (not the public,
 * schedule-aware getSiteSettings()), so what they edit is what was published.
 */

export type ThemeSnapshot = { brand: Brand; look: Look };
export type Draft = ThemeSnapshot & { savedAt: string; savedBy: string };

type LiveRow = {
  brand_name: string; wordmark_primary: string; wordmark_secondary: string; attribution: string;
  tagline: string; tagline_i18n: Record<string, { tagline?: string }> | null; logo_url: string | null;
  look: unknown; theme_draft: unknown;
};

function rowBrand(r: LiveRow): Brand {
  return {
    brandName: r.brand_name,
    wordmarkPrimary: r.wordmark_primary,
    wordmarkSecondary: r.wordmark_secondary,
    attribution: r.attribution ?? "",
    tagline: r.tagline,
    taglineAz: r.tagline_i18n?.az?.tagline ?? "",
    taglineRu: r.tagline_i18n?.ru?.tagline ?? "",
  };
}

export function parseSnapshot(raw: unknown): ThemeSnapshot | null {
  const r = (raw && typeof raw === "object" ? raw : null) as { brand?: unknown; look?: unknown } | null;
  if (!r) return null;
  const b = r.brand as Record<string, unknown> | undefined;
  // Old version snapshots stored taglineI18n; normalise to taglineAz/Ru.
  const i18n = (b?.taglineI18n ?? {}) as Record<string, { tagline?: string }>;
  const brand = brandSchema.safeParse({ taglineAz: i18n.az?.tagline ?? "", taglineRu: i18n.ru?.tagline ?? "", ...b });
  if (!brand.success) return null;
  return { brand: brand.data, look: sanitizeLook(r.look) };
}

export async function getLiveTheme(): Promise<{ live: ThemeSnapshot; logoUrl: string | null; draft: Draft | null }> {
  const r = await queryOne<LiveRow>(
    `select brand_name, wordmark_primary, wordmark_secondary, attribution, tagline, tagline_i18n, logo_url, look, theme_draft
       from site_settings where id = 1`
  );
  if (!r) throw new Error("site_settings row missing");
  const live = { brand: rowBrand(r), look: sanitizeLook(r.look) };
  const d = r.theme_draft as { savedAt?: string; savedBy?: string } | null;
  const snap = d ? parseSnapshot(d) : null;
  return { live, logoUrl: r.logo_url, draft: snap && d ? { ...snap, savedAt: d.savedAt ?? "", savedBy: d.savedBy ?? "" } : null };
}

/** Writes a snapshot as the live theme and records a version, in `tx`. */
export async function publishSnapshot(tx: Tx, snap: ThemeSnapshot, actor: string, note: string): Promise<number> {
  const prev = await tx.queryOne<{ tagline: string; tagline_i18n: Record<string, { tagline?: string }> | null; i18n_meta: unknown }>(
    "select tagline, tagline_i18n, i18n_meta from site_settings where id = 1 for update"
  );
  // English-only editing: an empty AZ/RU tagline in the snapshot means "not
  // given", so the stored translation is kept (auto-translate refreshes it
  // if the English changed). A snapshot that carries them restores them.
  const b = {
    ...snap.brand,
    taglineAz: snap.brand.taglineAz || prev?.tagline_i18n?.az?.tagline || "",
    taglineRu: snap.brand.taglineRu || prev?.tagline_i18n?.ru?.tagline || "",
  };
  const tagI18n = {
    ...(b.taglineAz ? { az: { tagline: b.taglineAz } } : {}),
    ...(b.taglineRu ? { ru: { tagline: b.taglineRu } } : {}),
  };
  const meta = nextMeta({
    english: { tagline: b.tagline },
    before: { az: { tagline: prev?.tagline_i18n?.az?.tagline ?? "" }, ru: { tagline: prev?.tagline_i18n?.ru?.tagline ?? "" } },
    after: { az: { tagline: b.taglineAz }, ru: { tagline: b.taglineRu } },
    meta: sanitizeMeta(prev?.i18n_meta),
  });
  const colors = {
    light: pickBrand(snap.look.light),
    dark: pickBrand(snap.look.dark),
  };
  await tx.query(
    `update site_settings set brand_name = $1, wordmark_primary = $2, wordmark_secondary = $3, attribution = $4,
       tagline = $5, tagline_i18n = $6, i18n_meta = $7, look = $8, colors = $9, updated_by = $10, updated_at = now()
     where id = 1`,
    [b.brandName, b.wordmarkPrimary, b.wordmarkSecondary, b.attribution, b.tagline, JSON.stringify(tagI18n),
     JSON.stringify(meta), JSON.stringify(snap.look), JSON.stringify(colors), actor]
  );
  const v = await tx.queryOne<{ id: string }>(
    "insert into theme_versions (published_by, note, snapshot) values ($1, $2, $3) returning id::text",
    [actor, note, JSON.stringify(snap)]
  );
  return Number(v?.id);
}

/** The 7 Phase B tokens, kept in site_settings.colors for compatibility. */
function pickBrand(p: Look["light"]) {
  const { primary, navy, leaf, logoBlue, good, warning, critical } = p;
  return { primary, navy, leaf, logoBlue, good, warning, critical };
}

export type VersionRow = { id: number; publishedAt: string; publishedBy: string | null; note: string | null; snapshot: ThemeSnapshot | null };

export async function listVersions(limit = 30): Promise<VersionRow[]> {
  const rows = await query<{ id: string; published_at: Date; published_by: string | null; note: string | null; snapshot: unknown }>(
    "select id::text, published_at, published_by, note, snapshot from theme_versions order by published_at desc, id desc limit $1",
    [limit]
  );
  return rows.map((r) => ({ id: Number(r.id), publishedAt: new Date(r.published_at).toISOString(), publishedBy: r.published_by, note: r.note, snapshot: parseSnapshot(r.snapshot) }));
}

export type ScheduleRow = { id: number; name: string; startsAt: string; endsAt: string; createdBy: string | null; active: boolean; look: Look };

export async function listSchedules(): Promise<ScheduleRow[]> {
  const rows = await query<{ id: string; name: string; starts_at: Date; ends_at: Date; created_by: string | null; active: boolean; look: unknown }>(
    `select id::text, name, starts_at, ends_at, created_by, (now() >= starts_at and now() < ends_at) as active, look
       from theme_schedules where ends_at > now() - interval '30 days' order by starts_at`
  );
  return rows.map((r) => ({
    id: Number(r.id), name: r.name, startsAt: new Date(r.starts_at).toISOString(), endsAt: new Date(r.ends_at).toISOString(),
    createdBy: r.created_by, active: r.active, look: sanitizeLook(r.look),
  }));
}
