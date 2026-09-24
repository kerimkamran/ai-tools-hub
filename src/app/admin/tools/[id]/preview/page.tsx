import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePermission, userCan } from "@/lib/auth";
import { getCategoryLabels, getToolByIdForAdmin } from "@/lib/registry";
import { localizeTool, STATUS_LABEL } from "@/lib/types";
import { LOCALES, LOCALE_LABEL } from "@/lib/i18n";
import { ToolCard } from "@/components/ToolCard";

export const dynamic = "force-dynamic";

/**
 * Preview (capability 5): the card and detail text exactly as a visitor
 * would see them in each language -- including drafts, which have no public
 * URL at all. Nothing here is cached or public.
 */
export default async function PreviewToolPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("catalog.view");
  const { id } = await params;
  const [tool, categories] = await Promise.all([getToolByIdForAdmin(id), getCategoryLabels()]);
  if (!tool) notFound();
  if (!userCan(user, "catalog.edit") && tool.status !== "draft") redirect("/admin");

  return (
    <main className="mx-auto max-w-[1000px] px-4 py-10">
      <Link href="/admin" className="text-sm underline underline-offset-4" style={{ color: "var(--muted)" }}>
        ← Catalog
      </Link>
      <h1 className="mt-4 text-xl font-semibold tracking-tight">Preview: {tool.name}</h1>
      <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
        Status: {STATUS_LABEL[tool.status]}.{" "}
        {tool.status === "draft" || tool.status === "archived"
          ? "Visitors cannot reach this tool."
          : tool.status === "unlisted"
            ? "Reachable by direct link only; not in the catalog or search engines."
            : "Shown in the public catalog."}
      </p>
      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {LOCALES.map((loc) => {
          // healthUrl is dropped so the preview never triggers a probe.
          const t = { ...localizeTool(tool, loc, categories), healthUrl: null };
          const fellBack = loc !== "en" && !tool.i18n[loc as "az" | "ru"]?.tagline;
          return (
            <section key={loc} lang={loc} aria-label={LOCALE_LABEL[loc]}>
              <h2 className="mb-2 text-sm font-medium">
                {LOCALE_LABEL[loc]}
                {fellBack && (
                  <span className="ml-2 text-xs" style={{ color: "var(--warning)" }}>
                    showing English — not translated
                  </span>
                )}
              </h2>
              <div className="pointer-events-none">
                <ToolCard tool={t} locale={loc} adminIcons />
              </div>
              <p className="mt-3 whitespace-pre-line text-sm" style={{ color: "var(--muted)" }}>
                {t.description}
              </p>
            </section>
          );
        })}
      </div>
    </main>
  );
}
