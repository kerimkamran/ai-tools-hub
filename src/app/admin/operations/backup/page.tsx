import { requirePermission } from "@/lib/auth";
import { query } from "@/lib/db/client";
import { RestoreForm } from "./RestoreForm";

export const dynamic = "force-dynamic";

export default async function BackupPage() {
  await requirePermission("ops.backup");
  const saved = await query<{ id: string; created_at: Date; created_by: string | null; reason: string }>(
    "select id::text, created_at, created_by, reason from backups order by created_at desc limit 10"
  );
  return (
    <main className="mx-auto max-w-[900px] px-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Backup & restore</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        A JSON file of the content: tools (with logos), categories, the knowledge base with its history, site settings,
        theme versions and schedules, and announcements. It never contains accounts, passwords, API keys, the audit log or
        stored conversations. Render&apos;s own Postgres backups remain the disaster-recovery layer.
      </p>
      <a href="/admin/operations/backup/export" className="mt-4 inline-flex items-center rounded-md px-5 text-sm font-medium"
        style={{ minHeight: 44, background: "var(--foreground)", color: "var(--background)" }} download>
        Download backup
      </a>

      <RestoreForm />

      {saved.length > 0 && (
        <section className="mt-10">
          <h2 className="text-base font-semibold">Saved automatically before a restore</h2>
          <ul className="mt-2 list-none space-y-1 p-0 text-sm">
            {saved.map((b) => (
              <li key={b.id}>
                <a href={`/admin/operations/backup/export?saved=${b.id}`} className="underline underline-offset-4" download>
                  #{b.id} · {new Date(b.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Baku" })} · {b.created_by ?? "—"}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
