import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getAllArticlesForAdmin, KB_I18N_KEYS } from "@/lib/kb";
import { missingTranslations } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function KbListPage() {
  await requireAdmin();
  const articles = await getAllArticlesForAdmin();
  const publishedChars = articles
    .filter((a) => a.status === "published")
    .reduce((n, a) => n + a.title.length + a.body.length, 0);

  return (
    <main className="mx-auto max-w-[900px] px-4 py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Knowledge base</h1>
        <Link
          href="/admin/kb/new"
          className="rounded-md px-4 py-2 text-sm font-medium"
          style={{ background: "var(--foreground)", color: "var(--background)" }}
        >
          Add article
        </Link>
      </div>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        What the assistant answers from, alongside the tool catalog. Only published
        articles are used. Markdown is fine. About {Math.round(publishedChars / 4).toLocaleString()} tokens
        published so far.
      </p>

      <ul className="mt-8 list-none space-y-2 p-0">
        {articles.map((a) => {
          const missing = missingTranslations(a.i18n, [...KB_I18N_KEYS]);
          return (
            <li
              key={a.id}
              className="flex items-center justify-between gap-4 rounded-lg border p-3"
              style={{ borderColor: "var(--line)" }}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{a.title}</p>
                <p className="truncate text-xs" style={{ color: "var(--faint)" }}>
                  {a.status === "published" ? "Published" : "Draft"} · #{a.sortOrder}
                  {a.tags.length ? ` · ${a.tags.join(", ")}` : ""}
                </p>
                {missing.length > 0 && (
                  <p className="text-xs" style={{ color: "var(--warning)" }}>
                    Missing translation: {missing.map((l) => l.toUpperCase()).join(", ")}
                  </p>
                )}
              </div>
              <Link
                href={`/admin/kb/${a.id}`}
                className="shrink-0 rounded border px-3 py-1.5 text-xs"
                style={{ borderColor: "var(--control-border)", color: "var(--foreground)" }}
              >
                Edit
              </Link>
            </li>
          );
        })}
      </ul>

      {articles.length === 0 && (
        <p className="mt-8 text-sm" style={{ color: "var(--muted)" }}>
          No articles yet. Without any, the assistant can still answer questions about the
          tools in the catalog.
        </p>
      )}
    </main>
  );
}
