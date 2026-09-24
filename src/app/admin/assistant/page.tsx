import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { getAiSettings, MODELS, currentMonth } from "@/lib/ai-settings";
import { encryptionKeySource } from "@/lib/secret-box";
import { AiSettingsForm } from "./AiSettingsForm";

export const dynamic = "force-dynamic";

export default async function AiSettingsPage() {
  await requireSuperAdmin();
  const s = await getAiSettings();
  const keySource = encryptionKeySource();
  const pct = s.monthlyBudgetUsd > 0 ? Math.min(100, (s.spendUsd / s.monthlyBudgetUsd) * 100) : 100;

  return (
    <main className="mx-auto max-w-[720px] px-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Assistant settings</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        The staff assistant at{" "}
        <Link href="/en/assistant" className="underline underline-offset-4">/en/assistant</Link>{" "}
        answers from the tool catalog and the{" "}
        <Link href="/admin/kb" className="underline underline-offset-4">knowledge base</Link>. Who can
        use it is managed on the <Link href="/admin/team" className="underline underline-offset-4">Team</Link> page.
      </p>

      <section className="mt-6 rounded-lg border p-4" style={{ borderColor: "var(--line)" }}>
        <p className="text-sm font-medium">
          Spend in {currentMonth()}: ${s.spendUsd.toFixed(2)} of ${s.monthlyBudgetUsd.toFixed(2)}
        </p>
        <div className="mt-2 h-2 w-full overflow-hidden rounded" style={{ background: "var(--line)" }}
          role="img" aria-label={`${pct.toFixed(0)}% of the monthly budget used`}>
          <div className="h-full" style={{ width: `${pct}%`, background: pct >= 90 ? "var(--critical)" : "var(--primary)" }} />
        </div>
        <p className="mt-2 text-xs" style={{ color: "var(--faint)" }}>
          Computed from the API&apos;s own token counts at the published per-model prices.
          {keySource === "derived" &&
            " The stored key is encrypted with a key derived from AUTH_SECRET; set SETTINGS_ENCRYPTION_KEY to use a dedicated one."}
        </p>
      </section>

      <AiSettingsForm
        models={MODELS.map((m) => ({ id: m.id, label: m.label }))}
        model={s.model}
        enabled={s.enabled}
        monthlyBudgetUsd={s.monthlyBudgetUsd}
        hourlyLimit={s.hourlyLimit}
        keyLast4={s.keyLast4}
        hasStoredKey={s.hasStoredKey}
        storedKeyReadable={s.storedKeyReadable}
        envKey={s.envKey}
      />
    </main>
  );
}
