import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { changedKeys, parseAuditFilter, searchAudit } from "@/lib/audit-query";
import { query } from "@/lib/db/client";

export const dynamic = "force-dynamic";

const AREAS = ["accounts", "security", "auth", "catalog", "categories", "kb", "ai", "theme", "translations", "operations"];

function show(v: unknown): string {
  if (v === undefined) return "—";
  const s = JSON.stringify(v);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("audit.view");
  const filter = parseAuditFilter(await searchParams);
  const [rows, unknown] = await Promise.all([
    searchAudit(filter),
    query<{ day: string; count: number }>(
      "select to_char(day, 'YYYY-MM-DD') as day, count from auth_failures_daily order by day desc limit 7"
    ),
  ]);
  const qs = new URLSearchParams(
    Object.entries(filter).filter(([, v]) => v) as Array<[string, string]>
  ).toString();

  const FIELD = "rounded-md border px-3 text-sm";
  const FS = { minHeight: 44, borderColor: "var(--control-border)", background: "var(--surface)" };

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Audit log</h1>
        <Link href={`/admin/audit/export${qs ? `?${qs}` : ""}`} className="flex items-center rounded-md border px-4 text-sm"
          style={{ minHeight: 44, borderColor: "var(--control-border)" }}>
          Export CSV
        </Link>
      </div>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        Who changed what, and when. Append-only: nothing here can be edited or deleted from the
        app. Secret values are never recorded.
      </p>

      <form method="get" className="mt-6 flex flex-wrap items-end gap-2">
        <label className="text-xs" style={{ color: "var(--muted)" }}>Person
          <input name="actor" defaultValue={filter.actor ?? ""} placeholder="email" className={`block ${FIELD}`} style={FS} />
        </label>
        <label className="text-xs" style={{ color: "var(--muted)" }}>Area
          <select name="area" defaultValue={filter.area ?? ""} className={`block ${FIELD}`} style={FS}>
            <option value="">All</option>
            {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="text-xs" style={{ color: "var(--muted)" }}>From
          <input type="date" name="from" defaultValue={filter.from ?? ""} className={`block ${FIELD}`} style={FS} />
        </label>
        <label className="text-xs" style={{ color: "var(--muted)" }}>To
          <input type="date" name="to" defaultValue={filter.to ?? ""} className={`block ${FIELD}`} style={FS} />
        </label>
        <button type="submit" className="rounded-md px-4 text-sm font-medium"
          style={{ minHeight: 44, background: "var(--foreground)", color: "var(--background)" }}>
          Filter
        </button>
      </form>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs" style={{ color: "var(--faint)" }}>
              <th scope="col" className="py-2 pr-3 font-medium">When (UTC)</th>
              <th scope="col" className="py-2 pr-3 font-medium">Who</th>
              <th scope="col" className="py-2 pr-3 font-medium">What</th>
              <th scope="col" className="py-2 pr-3 font-medium">Target</th>
              <th scope="col" className="py-2 font-medium">Changes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const keys = changedKeys(r.before, r.after);
              const b = (r.before ?? {}) as Record<string, unknown>;
              const a = (r.after ?? {}) as Record<string, unknown>;
              return (
                <tr key={r.id} className="border-t align-top" style={{ borderColor: "var(--line)" }}>
                  <td className="py-2 pr-3 whitespace-nowrap text-xs">{new Date(r.at).toISOString().slice(0, 19).replace("T", " ")}</td>
                  <td className="py-2 pr-3">{r.actor}</td>
                  <td className="py-2 pr-3"><code className="text-xs">{r.action}</code></td>
                  <td className="py-2 pr-3">{r.target ?? "—"}</td>
                  <td className="py-2 text-xs" style={{ color: "var(--muted)" }}>
                    {keys.length === 0
                      ? "—"
                      : keys.slice(0, 6).map((k) => (
                          <div key={k}>
                            <strong>{k}</strong>: {show(b[k])} → {show(a[k])}
                          </div>
                        ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="mt-6 text-sm" style={{ color: "var(--muted)" }}>No matching entries.</p>}
        {rows.length === 200 && (
          <p className="mt-4 text-xs" style={{ color: "var(--faint)" }}>Showing the newest 200. Narrow the filter or export CSV for everything.</p>
        )}
      </div>

      {unknown.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--faint)" }}>
            Failed sign-ins for unknown emails (daily counts)
          </h2>
          <ul className="mt-2 list-none p-0 text-sm">
            {unknown.map((u) => <li key={u.day}>{u.day}: {u.count}</li>)}
          </ul>
        </section>
      )}
    </main>
  );
}
