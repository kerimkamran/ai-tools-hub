import { requireAdmin } from "@/lib/auth";
import { getCategoriesForAdmin } from "@/lib/registry";
import { CategoriesForm } from "./CategoriesForm";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  await requireAdmin();
  const rows = await getCategoriesForAdmin();

  return (
    <main className="mx-auto max-w-[900px] px-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Categories</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        Translate each category once and it is translated on every tool. Blank
        fields show the English name.
      </p>
      {rows.length === 0 ? (
        <p className="mt-8 text-sm" style={{ color: "var(--muted)" }}>
          No categories yet — they appear here once a tool uses one.
        </p>
      ) : (
        <CategoriesForm rows={rows} />
      )}
    </main>
  );
}
