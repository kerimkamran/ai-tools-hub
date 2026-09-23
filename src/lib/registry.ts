import "server-only";
import { createPublicClient, hasSupabaseConfig } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fallbackTools } from "@/lib/config/fallback-tools";
import { rowToTool, type Tool, type ToolRow } from "@/lib/types";

/**
 * THE SEAM.
 *
 * Every read of the catalog goes through this module and nowhere else.
 * Swapping the datastore, adding a cache, or changing the fallback strategy
 * is a change to this one file -- no page or component knows where tools
 * come from.
 */

const SELECT =
  "id,slug,name,tagline,description,category,tags,icon,url,health_url,access,access_note,status,sort_order,created_at,updated_at";

function sortTools(tools: Tool[]): Tool[] {
  return [...tools].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
  );
}

/**
 * Tools shown in the catalog: published and planned, in sort order.
 *
 * Falls back to the static snapshot when Supabase is unconfigured or
 * unreachable, so a database outage degrades the catalog to read-only rather
 * than taking the site down.
 */
export async function getCatalogTools(): Promise<Tool[]> {
  if (!hasSupabaseConfig()) return sortTools(visible(fallbackTools));
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("tools")
      .select(SELECT)
      .in("status", ["published", "planned"]);
    if (error) throw error;
    if (!data?.length) return sortTools(visible(fallbackTools));
    return sortTools((data as ToolRow[]).map(rowToTool));
  } catch (err) {
    console.error("[registry] falling back to static catalog:", err);
    return sortTools(visible(fallbackTools));
  }
}

function visible(tools: Tool[]): Tool[] {
  return tools.filter((t) => t.status === "published" || t.status === "planned");
}

/** Detail page lookup. `unlisted` resolves here but never appears in the
 *  catalog or the sitemap -- that is the point of the status. */
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
      .neq("status", "archived")
      .maybeSingle();
    if (error) throw error;
    return data ? rowToTool(data as ToolRow) : null;
  } catch (err) {
    console.error("[registry] getToolBySlug failed:", err);
    return fallbackTools.find((t) => t.slug === slug && t.status !== "archived") ?? null;
  }
}

/** Admin list: every status, including archived. Service-role. */
export async function getAllToolsForAdmin(): Promise<Tool[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("tools").select(SELECT);
  if (error) throw new Error(error.message);
  return sortTools((data as ToolRow[]).map(rowToTool));
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
