import { requirePermission } from "@/lib/auth";
import { query } from "@/lib/db/client";
import { AnnouncementsClient } from "./AnnouncementsClient";

export const dynamic = "force-dynamic";

export default async function AnnouncementsPage() {
  await requirePermission("ops.announce");
  const rows = await query<{ id: string; severity: "info" | "warning" | "critical"; text_en: string; text_az: string; text_ru: string; starts_at: Date; ends_at: Date | null; created_by: string | null; state: string }>(
    `select id::text, severity, text_en, text_az, text_ru, starts_at, ends_at, created_by,
            case when starts_at > now() then 'scheduled' when ends_at is not null and ends_at <= now() then 'ended' else 'live' end as state
       from announcements where ends_at is null or ends_at > now() - interval '30 days'
      order by starts_at desc`
  );
  return (
    <main className="mx-auto max-w-[900px] px-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Announcements</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        A banner at the top of every public page. Write it in English — Azərbaycanca and Русский are translated
        automatically. Info and warning banners can be dismissed by visitors; critical ones cannot.
      </p>
      <AnnouncementsClient
        rows={rows.map((r) => ({
          id: Number(r.id), severity: r.severity, text: r.text_en, translated: Boolean(r.text_az && r.text_ru),
          startsAt: new Date(r.starts_at).toISOString(), endsAt: r.ends_at ? new Date(r.ends_at).toISOString() : null,
          createdBy: r.created_by, state: r.state as "live" | "scheduled" | "ended",
        }))}
      />
    </main>
  );
}
