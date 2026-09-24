import "server-only";
import { hasDatabaseConfig, query, queryOne } from "@/lib/db/client";
import { fallbackCategoryLabels, fallbackTools } from "@/lib/config/fallback-tools";
import { rowToTool, type CategoryLabels, type Tool, type ToolRow } from "@/lib/types";
import { sanitizeI18n } from "@/lib/i18n";

/**
 * THE SEAM.
 *
 * Every read of the catalog goes through this module and nowhere else, so
 * swapping the datastore, adding a cache, or changing the fallback strategy is
 * a change to this one file. No page or component knows where tools come from.
 *
 * Previously two Supabase clients (anon vs service-role) enforced the
 * public/admin split via Row Level Security. Plain Postgres has no public
 * REST endpoint for RLS to guard -- this pool is reachable only from this
 * app's own server code -- so the split is now explicit in each function's
 * own SQL: getCatalogTools()/getToolBySlug() filter `status` themselves;
 * the *ForAdmin() functions do not. See src/lib/db/client.ts's header
 * comment for the full reasoning.
 */

const COLUMNS =
  "id,slug,name,tagline,description,category,tags,icon,url,health_url,access,access_note,status,sort_order,created_at,updated_at,i18n";

function sortTools(tools: Tool[]): Tool[] {
  return [...tools].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
  );
}

function listable(tools: Tool[]): Tool[] {
  return tools.filter((t) => t.status === "published" || t.status === "planned");
}

/**
 * Tools shown in the catalog: published and planned, in sort order.
 *
 * Falls back to the static snapshot ONLY when the database is unconfigured
 * or the query actually fails.
 *
 * An empty result is NOT a failure. Deleting the last tool is a legitimate
 * state, and treating it as one would silently resurrect the hardcoded
 * fallback entries on the live site -- tools the admin had just removed,
 * reappearing with no way to get rid of them.
 */
export async function getCatalogTools(): Promise<Tool[]> {
  if (!hasDatabaseConfig()) return sortTools(listable(fallbackTools));
  try {
    const rows = await query<ToolRow>(
      `select ${COLUMNS} from tools where status in ('published', 'planned')`
    );
    // `rows` may legitimately be [] -- an empty catalog, not a broken one.
    return sortTools(rows.map(rowToTool));
  } catch (err) {
    console.error("[registry] catalog query failed, using static fallback:", err);
    return sortTools(listable(fallbackTools));
  }
}

/**
 * Detail page lookup. A single query, keyed on one exact slug, excluding
 * only 'archived'.
 *
 * The Supabase version split this into two steps (anon lookup, then a
 * service-role fallback for 'unlisted') because the anon key spoke to a
 * public PostgREST endpoint where any status admitted to a policy becomes
 * enumerable by anyone. That risk doesn't exist here: this query only ever
 * runs from this one Next.js route, which only ever supplies one slug at a
 * time -- there is no way to reach it with an open-ended filter, so a
 * single query keyed on the slug is exactly as unenumerable as the
 * two-step version was, with less code.
 */
export async function getToolBySlug(slug: string): Promise<Tool | null> {
  if (!hasDatabaseConfig()) {
    return fallbackTools.find((t) => t.slug === slug && t.status !== "archived") ?? null;
  }
  try {
    const row = await queryOne<ToolRow>(
      `select ${COLUMNS} from tools where slug = $1 and status <> 'archived'`,
      [slug]
    );
    return row ? rowToTool(row) : null;
  } catch (err) {
    console.error("[registry] slug lookup failed, using static fallback:", err);
    return fallbackTools.find((t) => t.slug === slug && t.status !== "archived") ?? null;
  }
}

/** Admin list: every status, including archived. No fallback -- only
 *  reachable from behind requireAdmin(). */
export async function getAllToolsForAdmin(): Promise<Tool[]> {
  const rows = await query<ToolRow>(`select ${COLUMNS} from tools`);
  return sortTools(rows.map(rowToTool));
}

export async function getToolByIdForAdmin(id: string): Promise<Tool | null> {
  const row = await queryOne<ToolRow>(`select ${COLUMNS} from tools where id = $1`, [id]);
  return row ? rowToTool(row) : null;
}

/** True when this id already exists -- used to separate create from edit. */
export async function toolIdExists(id: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>("select id from tools where id = $1", [id]);
  return Boolean(row);
}

type CategoryRow = { name: string; i18n: unknown };

function rowsToCategoryLabels(rows: CategoryRow[]): CategoryLabels {
  const out: CategoryLabels = {};
  for (const r of rows) {
    const map = sanitizeI18n(r.i18n, ["label"] as const);
    out[r.name] = { az: map.az?.label, ru: map.ru?.label };
  }
  return out;
}

/**
 * Category label translations for the public catalog. Same fallback
 * discipline as getCatalogTools(): the static snapshot only when the
 * database is unconfigured or the query fails. A missing label simply
 * renders the English category name.
 */
export async function getCategoryLabels(): Promise<CategoryLabels> {
  if (!hasDatabaseConfig()) return fallbackCategoryLabels;
  try {
    return rowsToCategoryLabels(await query<CategoryRow>("select name, i18n from categories"));
  } catch (err) {
    console.error("[registry] categories query failed, using static fallback:", err);
    return fallbackCategoryLabels;
  }
}

/** Admin: every category actually used by a tool, plus any stored label rows. */
export async function getCategoriesForAdmin(): Promise<
  Array<{ name: string; az: string; ru: string; toolCount: number }>
> {
  const [used, stored] = await Promise.all([
    query<{ category: string; n: string }>(
      "select category, count(*)::text as n from tools group by category"
    ),
    query<CategoryRow>("select name, i18n from categories"),
  ]);
  const labels = rowsToCategoryLabels(stored);
  const names = new Set([...used.map((u) => u.category), ...stored.map((s) => s.name)]);
  const counts = new Map(used.map((u) => [u.category, Number(u.n)]));
  return [...names]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      name,
      az: labels[name]?.az ?? "",
      ru: labels[name]?.ru ?? "",
      toolCount: counts.get(name) ?? 0,
    }));
}
