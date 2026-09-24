import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getLiveTheme } from "@/lib/theme-store";
import { describeGate, gate, previewStyle } from "@/lib/design";
import { getCatalogTools, getCategoryLabels } from "@/lib/registry";
import { localizeTool } from "@/lib/types";
import { LOCALES, LOCALE_NATIVE_NAME, type Locale } from "@/lib/i18n";
import { ToolCard } from "@/components/ToolCard";
import { BrandTitle } from "@/components/BrandTitle";
import { PublishPanel } from "./PublishPanel";

export const dynamic = "force-dynamic";

/**
 * Side-by-side preview of the DRAFT (capability 9): light and dark, EN/AZ/RU,
 * using the real catalog cards. The draft is applied to these containers
 * only, through CSS custom properties -- the public site is untouched.
 */
export default async function ThemePreviewPage() {
  await requirePermission("theme.manage");
  const { live, draft } = await getLiveTheme();
  const snap = draft ?? live;
  const failures = describeGate(gate(snap.look));
  const [tools, categories] = await Promise.all([getCatalogTools(), getCategoryLabels()]);
  const sample = tools.slice(0, 2);
  const tagline = (loc: Locale) => (loc === "az" ? snap.brand.taglineAz : loc === "ru" ? snap.brand.taglineRu : "") || snap.brand.tagline;

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-10">
      <Link href="/admin/theme" className="text-sm underline underline-offset-4" style={{ color: "var(--muted)" }}>← Back to editing</Link>
      <h1 className="mt-4 text-xl font-semibold tracking-tight">Preview {draft ? "the draft" : "(no draft — this is the published theme)"}</h1>

      <PublishPanel hasDraft={Boolean(draft)} failures={failures} />

      {(["light", "dark"] as const).map((mode) => (
        <section key={mode} className="mt-8">
          <h2 className="text-sm font-medium" style={{ color: "var(--muted)" }}>{mode === "light" ? "Light mode" : "Dark mode"}</h2>
          <div className="mt-2 grid gap-4 lg:grid-cols-3">
            {LOCALES.map((loc) => (
              <div key={loc} lang={loc} className="overflow-hidden rounded-lg border" style={{ ...previewStyle(snap.look, mode), borderColor: "var(--line)" }} aria-label={`${mode}, ${LOCALE_NATIVE_NAME[loc]}`}>
                <div className="flex items-center justify-between px-4 py-3" style={{ background: "color-mix(in srgb, var(--background) 88%, transparent)" }}>
                  <span className="text-sm font-semibold">
                    <span style={{ color: "var(--navy)" }}>{snap.brand.wordmarkPrimary}</span>
                    <span style={{ color: "var(--leaf)" }}>{snap.brand.wordmarkSecondary}</span>
                  </span>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>{LOCALE_NATIVE_NAME[loc]}</span>
                </div>
                <div style={{ height: 3, background: "linear-gradient(90deg, var(--logo-blue), var(--leaf))", display: "var(--accent-display)" }} />
                <div className="p-4">
                  <p className="text-xl font-semibold" style={{ color: "var(--navy)" }}><BrandTitle name={snap.brand.brandName} /></p>
                  <p className="text-sm" style={{ color: "var(--muted)" }}>{tagline(loc)}</p>
                  <div className="mt-3 flex items-center border px-3 text-sm" style={{ height: 40, borderRadius: "calc(var(--radius) * 3)", borderWidth: "var(--bw)", borderColor: "var(--control-border)", background: "var(--surface)", color: "var(--faint)" }}>
                    {loc === "az" ? "Alətləri axtarın…" : loc === "ru" ? "Поиск инструментов…" : "Search tools…"}
                  </div>
                  <div className="pointer-events-none mt-3 grid" style={{ gap: "var(--grid-gap)" }}>
                    {sample.map((t) => <ToolCard key={t.id} tool={{ ...localizeTool(t, loc, categories), healthUrl: null }} locale={loc} adminIcons />)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
