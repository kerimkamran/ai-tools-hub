import "server-only";
import { createPublicClient, hasSupabaseConfig } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fallbackTools } from "@/lib/config/fallback-tools";
import { rowToTool, type Tool, type ToolRow } from "@/lib/types";

/**
 * THE SEAM.
 *
 * Every read of the catalog goes through this module and nowhere else, so
 * swapping the datastore, adding a cache, or changing the fallback strategy is
 * a change to this one file. No page or component knows where tools come from.
 */

const SELECT =
  "id,slug,name,tagline,description,category,tags,icon,url,health_url,access,access_note,status,sort_order,created_at,updated_at";

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
 * Falls back to the static snapshot ONLY when Supabase is unconfigured or the
 * query actually fails.
 *
 * An empty result is NOT a failure. Deleting the last tool is a legitimate
 * state, and treating it as one would silently resurrect the hardcoded
 * fallback entries on the live site -- tools the admin had just removed,
 * reappearing with no way to get rid of them.
 */
export async function getCatalogTools(): Promise<Tool[]> {
  if (!hasSupabaseConfig()) return sortTools(listable(fallbackTools));
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("tools")
      .select(SELECT)
      .in("status", ["published", "planned"]);
    if (error) throw error;
    // `data` may legitimately be [] -- an empty catalog, not a broken one.
    return sortTools((data ?? []).map((r) => rowToTool(r as ToolRow)));
  } catch (err) {
    console.error("[registry] catalog query failed, using static fallback:", err);
    return sortTools(listable(fallbackTools));
  }
}

/**
 * Detail page lookup.
 *
 * Two-step on purpose. The anon key can only see published/planned rows (RLS),
 * which is what keeps 'unlisted' unenumerable over the public REST API. So an
 * unlisted tool is resolved in a second, server-only lookup keyed on the exact
 * slug -- a direct link works, but nobody can ask for "all unlisted tools".
 * 'archived' is excluded in both steps.
 */
export async function getToolBySlug(slug: string): Promise<Tool | null> {
  if (!hasSupabaseConfig()) {
    return fallbackTools.find((t) => t.slug === slug && t.status !== "archived") ?? null;
  }

  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("tools")
      .select(SELECT)
      .eq("slug", slug)
      .maybeSingle();
    if (error) throw error;
    if (data) return rowToTool(data as ToolRow);
  } catch (err) {
    console.error("[registry] public slug lookup failed:", err);
    return fallbackTools.find((t) => t.slug === slug && t.status !== "archived") ?? null;
  }

  // Not visible to the anon key. It may still be an unlisted tool reached by
  // direct link. This runs server-side only and is keyed on one exact slug.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("tools")
      .select(SELECT)
      .eq("slug", slug)
      .eq("status", "unlisted")
      .maybeSingle();
    if (error) throw error;
    return data ? rowToTool(data as ToolRow) : null;
  } catch (err) {
    console.error("[registry] unlisted slug lookup failed:", err);
    return null;
  }
}

/** Admin list: every status, including archived. Service-role. */
export async function getAllToolsForAdmin(): Promise<Tool[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("tools").select(SELECT);
  if (error) throw new Error(error.message);
  return sortTools((data ?? []).map((r) => rowToTool(r as ToolRow)));
}

export async function getToolByIdForAdmin(id: string): Promise<Tool | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tools")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToTool(data as ToolRow) : null;
}

/** True when this id already exists -- used to separate create from edit. */
export async function toolIdExists(id: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("tools").select("id").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}
