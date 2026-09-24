import Link from "next/link";
import { requirePermission, userCan } from "@/lib/auth";
import { getAllToolsForAdmin, getToolMetaForAdmin } from "@/lib/registry";
import { STATUS_LABEL, type Tool, type ToolStatus } from "@/lib/types";
import { fieldStatus, sanitizeMeta, type FieldStatus } from "@/lib/translation-status";
import { HEALTH_LABEL, latestHealthByTool, type LatestHealth } from "@/lib/health";
import { CatalogRow, type CatalogRowView } from "./CatalogRow";

export const dynamic = "force-dynamic";

const FILTERS: Array<{ key: "all" | ToolStatus; label: string }> = [
  { key: "all", label: "All" },
  { key: "published", label: "Published" },
  { key: "planned", label: "Planned" },
  { key: "draft", label: "Drafts" },
  { key: "unlisted", label: "Unlisted" },
  { key: "archived", label: "Archived" },
];

const RANK: Record<FieldStatus, number> = { missing: 3, stale: 2, review: 1, ok: 0, na: 0 };
const WORD: Record<FieldStatus, string> = { missing: "missing", stale: "needs update", review: "needs review", ok: "", na: "" };

/** Worst translation state per language, e.g. "AZ needs update · RU missing". */
function translationSummary(t: Tool, rawMeta: unknown): CatalogRowView["translation"] {
  const meta = sanitizeMeta(rawMeta);
  const english = { tagline: t.tagline, description: t.description, accessNote: t.accessNote ?? "" };
  const parts: string[] = [];
  let worst = 0;
  for (const loc of ["az", "ru"] as const) {
    let s: FieldStatus = "ok";
    for (const [field, en] of Object.entries(english)) {
      const f = fieldStatus(en, t.i18n[loc]?.[field as keyof typeof english], meta[loc]?.[field]);
      if (RANK[f] > RANK[s]) s = f;
    }
    if (s !== "ok" && s !== "na") parts.push(`${loc.toUpperCase()} ${WORD[s]}`);
    worst = Math.max(worst, RANK[s]);
  }
  if (!parts.length) return null;
  return { label: parts.join(" · "), color: worst >= 2 ? "var(--warning)" : "var(--muted)" };
}

function healthView(h: LatestHealth | undefined): CatalogRowView["health"] {
  if (!h) return null;
  const color = h.outcome === "up" ? "var(--good)" : h.outcome === "error" ? "var(--critical)" : "var(--warning)";
  return {
    label: HEALTH_LABEL[h.outcome],
    color,
    when: `Checked ${new Date(h.checkedAt).toUTCString()}${h.durationMs != null ? ` · ${h.durationMs} ms` : ""}`,
  };
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requirePermission("catalog.view");
  const fullEditor = userCan(user, "catalog.edit");
  const canDraft = userCan(user, "catalog.draft");
  const { status: rawFilter } = await searchParams;
  const filter = FILTERS.some((f) => f.key === rawFilter) ? (rawFilter as (typeof FILTERS)[number]["key"]) : "all";

  const [all, metaById, health] = await Promise.all([getAllToolsForAdmin(), getToolMetaForAdmin(), latestHealthByTool()]);
  const counts = new Map<string, number>();
  for (const t of all) counts.set(t.status, (counts.get(t.status) ?? 0) + 1);
  const tools = filter === "all" ? all : all.filter((t) => t.status === filter);

  const rows: CatalogRowView[] = tools.map((t, i) => {
    // First/last within its group (featured tools always sort first).
    const prev = tools[i - 1];
    const next = tools[i + 1];
    return {
      id: t.id,
      name: t.name,
      icon: t.icon,
      hasIconImage: t.hasIconImage,
      iconVersion: t.iconVersion,
      maintenance: t.maintenance ? `${t.maintenance.message}${t.maintenance.until ? ` (until ${new Date(t.maintenance.until).toLocaleDateString("en-GB")})` : ""}` : null,
      slug: t.slug,
      category: t.category,
      status: t.status,
      statusLabel: STATUS_LABEL[t.status],
      featured: t.featured,
      hasHealthUrl: Boolean(t.healthUrl),
      health: healthView(health.get(t.id)),
      translation: translationSummary(t, metaById.get(t.id)),
      canEdit: fullEditor,
      canOpen: fullEditor || t.status === "draft",
      canDuplicate: canDraft,
      first: filter !== "all" || !prev || prev.featured !== t.featured,
      last: filter !== "all" || !next || next.featured !== t.featured,
    };
  });

  return (
    <main className="mx-auto max-w-[900px] px-4 py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Catalog</h1>
        <Link
          href="/admin/tools/new"
          className="flex items-center rounded-md px-4 text-sm font-medium"
          style={{ minHeight: 44, background: "var(--foreground)", color: "var(--background)" }}
        >
          + Add tool
        </Link>
      </div>

      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        New tools start as drafts, which visitors cannot reach. Changes appear on the public catalog within a minute.
        {!fullEditor && " As an editor you can create and edit drafts; an admin publishes them."}
      </p>

      <nav aria-label="Filter by status" className="mt-6 flex flex-wrap gap-1 text-sm">
        {FILTERS.map((f) => {
          const n = f.key === "all" ? all.length : counts.get(f.key) ?? 0;
          const on = f.key === filter;
          return (
            <Link
              key={f.key}
              href={f.key === "all" ? "/admin" : `/admin?status=${f.key}`}
              aria-current={on ? "page" : undefined}
              className="flex items-center rounded-full border px-3"
              style={{
                minHeight: 36,
                borderColor: on ? "var(--foreground)" : "var(--line)",
                color: on ? "var(--foreground)" : "var(--muted)",
              }}
            >
              {f.label} ({n})
            </Link>
          );
        })}
      </nav>

      <ul className="mt-4 list-none space-y-2 p-0">
        {rows.map((r) => (
          <CatalogRow key={r.id} t={r} />
        ))}
      </ul>

      {rows.length === 0 && (
        <p className="mt-8 text-sm" style={{ color: "var(--muted)" }}>
          {filter === "all" ? "Nothing in the catalog yet." : "No tools with this status."}
        </p>
      )}
      {filter !== "all" && rows.length > 0 && (
        <p className="mt-4 text-xs" style={{ color: "var(--faint)" }}>
          Reordering is available on the “All” view.
        </p>
      )}
    </main>
  );
}
