import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { listSchedules, listVersions, getLiveTheme } from "@/lib/theme-store";
import { PRESETS } from "@/lib/design";
import { History } from "./History";

export const dynamic = "force-dynamic";

export default async function ThemeHistoryPage() {
  await requirePermission("theme.manage");
  const [versions, schedules, { draft }] = await Promise.all([listVersions(), listSchedules(), getLiveTheme()]);
  return (
    <main className="mx-auto max-w-[900px] px-4 py-10">
      <Link href="/admin/theme" className="text-sm underline underline-offset-4" style={{ color: "var(--muted)" }}>← Design Studio</Link>
      <h1 className="mt-4 text-xl font-semibold tracking-tight">Versions & schedules</h1>
      <History
        versions={versions.map((v, i) => ({
          id: v.id, publishedAt: v.publishedAt, publishedBy: v.publishedBy, note: v.note, current: i === 0,
          swatch: v.snapshot ? [v.snapshot.look.light.canvas, v.snapshot.look.light.primary, v.snapshot.look.light.leaf, v.snapshot.look.dark.canvas] : [],
        }))}
        schedules={schedules.map((s) => ({ id: s.id, name: s.name, startsAt: s.startsAt, endsAt: s.endsAt, active: s.active, createdBy: s.createdBy }))}
        sources={[
          ...PRESETS.map((p) => ({ value: `preset:${p.id}`, label: `Preset: ${p.label}` })),
          ...(draft ? [{ value: "draft", label: "The current draft" }] : []),
          ...versions.slice(0, 10).map((v) => ({ value: `version:${v.id}`, label: `Version #${v.id}${v.note ? ` — ${v.note}` : ""}` })),
        ]}
      />
    </main>
  );
}
