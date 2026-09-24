import { requirePermission } from "@/lib/auth";
import { getCategoriesForAdmin } from "@/lib/registry";
import { fieldStatus, sanitizeMeta, STATUS_LABEL } from "@/lib/translation-status";
import { CategoryManager } from "./CategoryManager";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  await requirePermission("categories.manage");
  const rows = await getCategoriesForAdmin();

  const managed = rows.map((r) => {
    const meta = sanitizeMeta(r.meta);
    const notes = (["az", "ru"] as const)
      .map((loc) => [loc, fieldStatus(r.name, r[loc], meta[loc]?.label)] as const)
      .filter(([, s]) => s === "stale" || s === "review")
      .map(([loc, s]) => `${loc.toUpperCase()} ${STATUS_LABEL[s].toLowerCase()}`);
    return { name: r.name, toolCount: r.toolCount, translation: notes.length ? notes.join(" · ") : null };
  });

  return (
    <main className="mx-auto max-w-[900px] px-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Categories</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        Category names are English; they are translated automatically when you add or rename one
        (corrections: Content → Translations).
      </p>
      <CategoryManager rows={managed} />
    </main>
  );
}
