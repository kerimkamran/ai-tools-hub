import { requirePermission } from "@/lib/auth";
import { query } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/**
 * Usage (capability 10): daily totals only -- no cookies, IPs, user IDs or
 * search text were ever collected, so none can be shown.
 */
/** The last `n` calendar days in Baku (UTC+4), oldest first. */
function lastDays(n: number): string[] {
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => new Date(now + 4 * 3600e3 - (n - 1 - i) * 86400e3).toISOString().slice(0, 10));
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requirePermission("ops.analytics");
  const days = [7, 30, 90].includes(Number((await searchParams).days)) ? Number((await searchParams).days) : 30;
  const [rows, tools] = await Promise.all([
    query<{ day: string; metric: string; key: string; locale: string; count: number }>(
      `select to_char(day, 'YYYY-MM-DD') as day, metric, key, locale, count from usage_daily
        where day > (now() at time zone 'Asia/Baku')::date - $1::int order by day`,
      [days]
    ),
    query<{ id: string; name: string }>("select id, name from tools"),
  ]);
  const toolName = new Map(tools.map((t) => [t.id, t.name]));
  const sum = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).reduce((n, r) => n + r.count, 0);

  const opensByTool = new Map<string, number>();
  for (const r of rows.filter((r) => r.metric === "tool_open")) opensByTool.set(r.key, (opensByTool.get(r.key) ?? 0) + r.count);
  const topTools = [...opensByTool.entries()].sort((a, b) => b[1] - a[1]);
  const maxOpens = Math.max(1, ...topTools.map(([, n]) => n));

  const dayList = lastDays(days);
  const perDay = dayList.map((d) => ({ d, n: rows.filter((r) => r.day === d && r.metric === "tool_open").reduce((a, r) => a + r.count, 0) }));
  const maxDay = Math.max(1, ...perDay.map((p) => p.n));

  const byLocale = (metric: string) => ["en", "az", "ru"].map((l) => `${l.toUpperCase()} ${sum((r) => r.metric === metric && r.locale === l)}`).join(" · ");

  return (
    <main className="mx-auto max-w-[900px] px-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Usage</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        Daily totals only. The public site sets no cookies and nothing about visitors (IP address, account, search text) is stored.
      </p>
      <nav aria-label="Period" className="mt-4 flex gap-2 text-sm">
        {[7, 30, 90].map((d) => (
          <a key={d} href={`/admin/operations/analytics?days=${d}`} aria-current={d === days ? "page" : undefined}
            className="flex items-center rounded-full border px-3" style={{ minHeight: 36, borderColor: d === days ? "var(--foreground)" : "var(--line)" }}>
            {d} days
          </a>
        ))}
      </nav>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          ["Tool opens", sum((r) => r.metric === "tool_open"), byLocale("tool_open")],
          ["Searches with no result", sum((r) => r.metric === "search_empty"), byLocale("search_empty")],
          ["Assistant questions", sum((r) => r.metric === "assistant_question"), byLocale("assistant_question")],
        ].map(([label, n, split]) => (
          <div key={String(label)} className="rounded-lg border p-4" style={{ borderColor: "var(--line)" }}>
            <p className="text-xs" style={{ color: "var(--muted)" }}>{label}</p>
            <p className="mt-1 text-2xl font-semibold">{n}</p>
            <p className="mt-1 text-xs" style={{ color: "var(--faint)" }}>{split}</p>
          </div>
        ))}
      </div>

      <section className="mt-8">
        <h2 className="text-base font-semibold">Tool opens per day</h2>
        <div className="mt-3 flex h-32 items-end gap-[2px]" role="img" aria-label={`Tool opens per day over ${days} days`}>
          {perDay.map((p) => (
            <div key={p.d} title={`${p.d}: ${p.n}`} className="flex-1 rounded-t" style={{ height: `${(p.n / maxDay) * 100}%`, minHeight: p.n ? 2 : 0, background: "var(--primary)" }} />
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold">Opens by tool</h2>
        <ul className="mt-3 list-none space-y-2 p-0">
          {topTools.map(([id, n]) => (
            <li key={id} className="text-sm">
              <div className="flex justify-between"><span>{toolName.get(id) ?? id}</span><span style={{ color: "var(--muted)" }}>{n}</span></div>
              <div className="mt-1 h-2 rounded" style={{ background: "var(--line)" }}><div className="h-full rounded" style={{ width: `${(n / maxOpens) * 100}%`, background: "var(--primary)" }} /></div>
            </li>
          ))}
        </ul>
        {topTools.length === 0 && <p className="mt-2 text-sm" style={{ color: "var(--faint)" }}>No opens counted yet.</p>}
      </section>
    </main>
  );
}
