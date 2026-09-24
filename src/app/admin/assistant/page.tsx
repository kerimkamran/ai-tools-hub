import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getAiSettings, currentMonth } from "@/lib/ai-settings";
import { currentAlerts, listConnections, listPurposes, resolvePurpose } from "@/lib/connections";
import { PURPOSES, providerById } from "@/lib/providers";
import { AiSettingsForm } from "./AiSettingsForm";

export const dynamic = "force-dynamic";

function Bar({ used, limit, label }: { used: number; limit: number; label: string }) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 100;
  const color = pct >= 100 ? "var(--critical)" : pct >= 80 ? "var(--warning)" : "var(--primary)";
  return (
    <div className="mt-2 h-2 w-full overflow-hidden rounded" style={{ background: "var(--line)" }} role="img" aria-label={`${label}: ${pct.toFixed(0)}% used`}>
      <div className="h-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export default async function AiSettingsPage() {
  await requirePermission("ai.manage");
  const [s, connections, purposes, alerts] = await Promise.all([getAiSettings(), listConnections(), listPurposes(), currentAlerts()]);
  const serving = await Promise.all(PURPOSES.map(async (p) => ({ p, r: await resolvePurpose(p.id) })));
  const byId = new Map(connections.map((c) => [c.id, c]));

  return (
    <main className="mx-auto max-w-[760px] px-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Assistant & spend</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        The staff assistant at <Link href="/en/assistant" className="underline underline-offset-4">/en/assistant</Link> answers
        from the catalog and the <Link href="/admin/kb" className="underline underline-offset-4">knowledge base</Link>.
        Keys and models are set under <Link href="/admin/ai/connections" className="underline underline-offset-4">Connections</Link>.
      </p>

      {alerts.length > 0 && (
        <div role="alert" className="mt-6 space-y-1 rounded-lg border p-4 text-sm" style={{ borderColor: "var(--warning)" }}>
          {alerts.map((a) => {
            const name = a.scope === "budget" ? "The monthly AI budget" : `Connection “${byId.get(Number(a.scope.split(":")[1]))?.label ?? a.scope}”`;
            return (
              <p key={a.scope} style={{ color: a.threshold >= 100 ? "var(--critical)" : "var(--warning)" }}>
                {name} has reached {a.threshold}% (${a.spendUsd.toFixed(2)} of ${a.limitUsd.toFixed(2)})
                {a.threshold >= 100 ? " — AI calls through it are stopped for the rest of the month." : "."}
              </p>
            );
          })}
        </div>
      )}

      <section className="mt-6 rounded-lg border p-4" style={{ borderColor: "var(--line)" }}>
        <p className="text-sm font-medium">
          Spend in {currentMonth()}: ${s.spendUsd.toFixed(2)} of ${s.monthlyBudgetUsd.toFixed(2)}
        </p>
        <Bar used={s.spendUsd} limit={s.monthlyBudgetUsd} label="Monthly budget" />
        <ul className="mt-4 list-none space-y-3 p-0">
          {connections.map((c) => (
            <li key={c.id} className="text-xs" style={{ color: "var(--muted)" }}>
              <span className="font-medium" style={{ color: "var(--foreground)" }}>{c.label}</span> ({providerById(c.provider)?.name}) ·
              ${c.spendUsd.toFixed(2)}
              {c.monthlyCapUsd !== null ? ` of $${c.monthlyCapUsd.toFixed(2)} cap` : " · no cap"}
              {c.monthlyCapUsd !== null && <Bar used={c.spendUsd} limit={c.monthlyCapUsd} label={`${c.label} cap`} />}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs" style={{ color: "var(--faint)" }}>
          Computed from the API&apos;s own token counts at the published per-model prices. Alerts appear here at 50%, 80% and 100%.
        </p>
      </section>

      <section className="mt-6 rounded-lg border p-4 text-sm" style={{ borderColor: "var(--line)" }}>
        <h2 className="font-medium">What serves each purpose</h2>
        <ul className="mt-2 list-none space-y-1 p-0">
          {serving.map(({ p, r }) => {
            const pv = purposes.find((x) => x.purpose === p.id);
            const c = pv?.connectionId ? byId.get(pv.connectionId) : undefined;
            return (
              <li key={p.id} style={{ color: r.ok ? "var(--foreground)" : "var(--warning)" }}>
                {p.label}: {c ? `${c.label} · ${pv?.model}` : "not set"}
                {!r.ok && (r.code === "connection_cap" ? " — cap reached" : " — not working (check the connection)")}
              </li>
            );
          })}
        </ul>
      </section>

      <AiSettingsForm
        enabled={s.enabled}
        monthlyBudgetUsd={s.monthlyBudgetUsd}
        hourlyLimit={s.hourlyLimit}
        dailyLimit={s.dailyLimit}
        storeTranscripts={s.storeTranscripts}
        autoTranslate={s.autoTranslate}
      />
    </main>
  );
}
