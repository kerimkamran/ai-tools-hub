import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getAllToolsForAdmin } from "@/lib/registry";
import { STATUS_LABEL } from "@/lib/types";
import { DeleteButton } from "./DeleteButton";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();
  const tools = await getAllToolsForAdmin();

  return (
    <main className="mx-auto max-w-[900px] px-4 py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Catalog</h1>
        <Link
          href="/admin/tools/new"
          className="rounded-md px-4 py-2 text-sm font-medium"
          style={{ background: "var(--foreground)", color: "var(--background)" }}
        >
          Add tool
        </Link>
      </div>

      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        {tools.length} {tools.length === 1 ? "entry" : "entries"}. Changes appear on the
        public catalog within seconds — no deploy needed.
      </p>

      <ul className="mt-8 list-none space-y-2 p-0">
        {tools.map((t) => (
          <li
            key={t.id}
            className="flex items-center justify-between gap-4 rounded-lg border p-3"
            style={{ borderColor: "var(--line)" }}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span aria-hidden="true" className="text-xl leading-none">{t.icon}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{t.name}</p>
                <p className="truncate text-xs" style={{ color: "var(--faint)" }}>
                  {t.id} · /{t.slug} · {t.category} · {STATUS_LABEL[t.status]} · #{t.sortOrder}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link
                href={`/admin/tools/${t.id}`}
                className="rounded border px-3 py-1.5 text-xs"
                style={{ borderColor: "var(--control-border)", color: "var(--foreground)" }}
              >
                Edit
              </Link>
              <DeleteButton id={t.id} name={t.name} />
            </div>
          </li>
        ))}
      </ul>

      {tools.length === 0 && (
        <p className="mt-8 text-sm" style={{ color: "var(--muted)" }}>
          Nothing in the catalog yet.
        </p>
      )}
    </main>
  );
}
