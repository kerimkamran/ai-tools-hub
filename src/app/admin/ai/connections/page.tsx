import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { listConnections, listPurposes } from "@/lib/connections";
import { PROVIDERS, PURPOSES, providerById } from "@/lib/providers";
import { ConnectionRow, type ConnectionRowView } from "./ConnectionRow";
import { PurposesForm } from "./PurposesForm";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<{ added?: string }> }) {
  await requirePermission("ai.manage");
  const [connections, purposes] = await Promise.all([listConnections(), listPurposes()]);
  const { added } = await searchParams;

  const rows: ConnectionRowView[] = connections.map((c) => ({
    id: c.id,
    label: c.label,
    providerName: providerById(c.provider)?.name ?? c.provider,
    adapter: Boolean(providerById(c.provider)?.adapter),
    keyLast4: c.keyLast4,
    keyReadable: c.keyReadable,
    envManaged: c.envManaged,
    enabled: c.enabled,
    usedBy: c.usedBy.map((u) => PURPOSES.find((p) => p.id === u)?.label ?? u),
    freePurposes: PURPOSES.filter((p) => !c.usedBy.includes(p.id)).map((p) => ({ id: p.id, label: p.label })),
    createdBy: c.createdBy,
    lastUsedAt: c.lastUsedAt,
    lastTestedAt: c.lastTestedAt,
    lastTestOk: c.lastTestOk,
    lastTestMessage: c.lastTestMessage,
  }));

  const eligible = connections
    .filter((c) => providerById(c.provider)?.adapter)
    .map((c) => ({ id: c.id, label: `${c.label}${c.enabled ? "" : " (disabled)"}`, models: providerById(c.provider)!.models! }));

  return (
    <main className="mx-auto max-w-[900px] px-4 py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Connections</h1>
        <Link href="/admin/ai/connections/new" className="flex items-center rounded-md px-4 text-sm font-medium"
          style={{ minHeight: 44, background: "var(--foreground)", color: "var(--background)" }}>
          + Add connection
        </Link>
      </div>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        API keys from any provider ({PROVIDERS.map((p) => p.name).join(", ")}). A key is shown only by its last four
        characters once saved and never leaves the server. Only providers with a built-in adapter — Anthropic today —
        can power a purpose; keys for the others can be stored and tested now.
      </p>
      {added && <p role="status" className="mt-4 text-sm" style={{ color: "var(--good)" }}>Connection added. Use ⋯ → Test connection to check it.</p>}

      <ul className="mt-6 list-none space-y-2 p-0">
        {rows.map((r) => <ConnectionRow key={r.id} c={r} />)}
      </ul>
      {rows.length === 0 && <p className="mt-6 text-sm" style={{ color: "var(--muted)" }}>No connections yet.</p>}

      <section className="mt-10">
        <h2 className="text-base font-semibold">Purposes</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>Which connection and model serve each job.</p>
        <PurposesForm
          purposes={PURPOSES.map((p) => ({ id: p.id, label: p.label, hint: p.hint }))}
          current={Object.fromEntries(purposes.map((p) => [p.purpose, { connectionId: p.connectionId, model: p.model }]))}
          connections={eligible}
        />
      </section>
    </main>
  );
}
