import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { getConnection } from "@/lib/connections";
import { PROVIDERS } from "@/lib/providers";
import { ConnectionForm } from "./ConnectionForm";

export const dynamic = "force-dynamic";

export default async function ConnectionPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("ai.manage");
  const { id } = await params;
  const isNew = id === "new";
  if (!isNew && !/^\d+$/.test(id)) notFound();
  const c = isNew ? null : await getConnection(Number(id));
  if (!isNew && !c) notFound();

  return (
    <main className="mx-auto max-w-[640px] px-4 py-10">
      <Link href="/admin/ai/connections" className="text-sm underline underline-offset-4" style={{ color: "var(--muted)" }}>
        ← Connections
      </Link>
      <h1 className="mt-4 text-xl font-semibold tracking-tight">{c ? `Edit ${c.label}` : "Add connection"}</h1>
      <ConnectionForm
        providers={PROVIDERS}
        existing={
          c
            ? {
                id: c.id,
                provider: c.provider,
                label: c.label,
                config: c.config,
                keyLast4: c.keyLast4,
                envManaged: c.envManaged,
                monthlyCapUsd: c.monthlyCapUsd,
              }
            : null
        }
      />
    </main>
  );
}
