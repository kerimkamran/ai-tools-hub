"use client";

import { useState } from "react";
import { useKeepAction } from "@/components/admin/useKeepAction";
import type { ProviderTemplate } from "@/lib/providers";
import { saveConnection, type ConnState } from "../../actions";

const FIELD = "mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none";
const STYLE = { borderColor: "var(--control-border)", background: "var(--surface)", color: "var(--foreground)" };

type Existing = {
  id: number;
  provider: string;
  label: string;
  config: Record<string, string>;
  keyLast4: string | null;
  envManaged: boolean;
  monthlyCapUsd: number | null;
};

export function ConnectionForm({ providers, existing }: { providers: ProviderTemplate[]; existing: Existing | null }) {
  const [state, onSubmit, pending] = useKeepAction<ConnState>(saveConnection, {});
  const [providerId, setProviderId] = useState(existing?.provider ?? providers[0].id);
  const t = providers.find((p) => p.id === providerId)!;

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-5" autoComplete="off">
      {existing && <input type="hidden" name="id" value={existing.id} />}
      {state.error && <p role="alert" className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: "var(--critical)", color: "var(--critical)" }}>{state.error}</p>}
      {state.ok && !pending && <p role="status" className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: "var(--good)", color: "var(--good)" }}>{state.ok}</p>}

      <div>
        <label htmlFor="provider" className="block text-sm font-medium">Provider</label>
        {existing ? (
          <p className="mt-1 text-sm">{t.name} <span className="text-xs" style={{ color: "var(--faint)" }}>(cannot be changed — add a new connection instead)</span></p>
        ) : (
          <select id="provider" name="provider" value={providerId} onChange={(e) => setProviderId(e.target.value as typeof providerId)} className={FIELD} style={STYLE}>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.name}{p.adapter ? "" : " — store & test only"}</option>)}
          </select>
        )}
        {!t.adapter && (
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            This provider can be stored and tested now; powering the assistant with it needs an adapter (a code change).
          </p>
        )}
      </div>

      <div>
        <label htmlFor="label" className="block text-sm font-medium">Name</label>
        <input id="label" name="label" required maxLength={60} defaultValue={existing?.label ?? t.name} className={FIELD} style={STYLE} />
      </div>

      <div>
        <label htmlFor="apiKey" className="block text-sm font-medium">API key</label>
        <p className="text-xs" style={{ color: "var(--faint)" }}>
          {existing?.envManaged
            ? `Managed by the ANTHROPIC_API_KEY environment variable (…${existing.keyLast4}), which takes precedence. A key saved here is used only if that variable is removed.`
            : existing?.keyLast4
              ? `Saved key ends in …${existing.keyLast4}. Leave empty to keep it; paste a new one to replace it. The saved key is never shown.`
              : `${t.keyHint}. Encrypted before it is stored.`}
        </p>
        <input id="apiKey" name="apiKey" type="password" autoComplete="new-password" spellCheck={false} maxLength={400}
          required={!existing} className={FIELD} style={STYLE} />
      </div>

      {t.fields.map((f) => (
        <div key={f.key}>
          <label htmlFor={`cfg-${f.key}`} className="block text-sm font-medium">{f.label}{f.required ? "" : " (optional)"}</label>
          {f.hint && <p className="text-xs" style={{ color: "var(--faint)" }}>{f.hint}</p>}
          <input id={`cfg-${f.key}`} name={`cfg:${f.key}`} required={f.required} maxLength={f.max} placeholder={f.placeholder}
            defaultValue={existing?.config[f.key] ?? ""} className={FIELD} style={STYLE} />
        </div>
      ))}

      <details className="rounded-lg border p-3" style={{ borderColor: "var(--line)" }} open={existing?.monthlyCapUsd != null}>
        <summary className="cursor-pointer text-sm font-medium" style={{ minHeight: 32 }}>Advanced</summary>
        <label htmlFor="monthlyCap" className="mt-3 block text-sm">Monthly cap for this connection (USD)</label>
        <p className="text-xs" style={{ color: "var(--faint)" }}>Optional. Calls through it stop at the cap, even if the overall budget has room. Alerts at 50%, 80% and 100%.</p>
        <input id="monthlyCap" name="monthlyCap" type="number" min={0} step="0.01" defaultValue={existing?.monthlyCapUsd ?? ""} className={FIELD} style={STYLE} />
      </details>

      <button type="submit" disabled={pending} className="rounded-md px-5 text-sm font-medium disabled:opacity-50"
        style={{ minHeight: 44, background: "var(--foreground)", color: "var(--background)" }}>
        {pending ? "Saving…" : existing ? "Save" : "Add connection"}
      </button>
    </form>
  );
}
