import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getLiveTheme } from "@/lib/theme-store";
import { PRESETS } from "@/lib/design";
import { StudioForm } from "./StudioForm";
import { LogoForm, PresetPicker } from "./StudioSide";

export const dynamic = "force-dynamic";

export default async function ThemePage({ searchParams }: { searchParams: Promise<{ applied?: string; t?: string }> }) {
  await requirePermission("theme.manage");
  const { live, draft, logoUrl } = await getLiveTheme();
  const start = draft ?? live;
  const { applied, t } = await searchParams;
  const appliedPreset = PRESETS.find((p) => p.id === applied);

  return (
    <main className="mx-auto max-w-[900px] px-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Design Studio</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        Edit a draft, preview it in light and dark and in all three languages, then publish. Every publish is kept as a
        version you can roll back to in one click. Only listed options and strict hex colours are accepted, and a
        palette that fails the contrast gate cannot be published.
      </p>
      <nav aria-label="Design Studio" className="mt-4 flex flex-wrap gap-4 text-sm">
        <Link href="/admin/theme/preview" className="underline underline-offset-4">Preview & publish</Link>
        <Link href="/admin/theme/history" className="underline underline-offset-4">Versions & schedules</Link>
      </nav>
      <p className="mt-4 rounded-md border px-3 py-2 text-xs" style={{ borderColor: draft ? "var(--warning)" : "var(--line)", color: "var(--muted)" }}>
        {draft
          ? `Editing the draft saved ${new Date(draft.savedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} by ${draft.savedBy}. The public site still shows the published theme.`
          : "No draft yet — you are starting from the published theme."}
      </p>

      <div className="mt-8 grid gap-8">
        <PresetPicker
          current={start.look.preset}
          presets={PRESETS.map((p) => ({
            id: p.id, label: p.label, description: p.description,
            swatch: [p.look.light.canvas, p.look.light.primary, p.look.light.leaf, p.look.dark.canvas, p.look.dark.primary],
          }))}
        />
        <LogoForm hasLogo={Boolean(logoUrl)} />
      </div>

      {appliedPreset && (
        <p role="status" className="mt-6 text-sm" style={{ color: "var(--good)" }}>
          “{appliedPreset.label}” loaded into the draft. Fine-tune it, then preview and publish.
        </p>
      )}
      {/* Remounts only when a preset was applied (new ?t=), not on its own saves. */}
      <StudioForm key={t ?? "base"} brand={start.brand} look={start.look} />
    </main>
  );
}
