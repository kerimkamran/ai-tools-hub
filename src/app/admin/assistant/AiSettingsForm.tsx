"use client";

import { useActionState } from "react";
import { saveAiSettings, type AiSettingsState } from "./actions";

type Props = {
  models: Array<{ id: string; label: string }>;
  model: string;
  enabled: boolean;
  monthlyBudgetUsd: number;
  hourlyLimit: number;
  keyLast4: string | null;
  hasStoredKey: boolean;
  storedKeyReadable: boolean;
  envKey: boolean;
};

const FIELD = "mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none";
const FIELD_STYLE = {
  borderColor: "var(--control-border)",
  background: "var(--surface)",
  color: "var(--foreground)",
};

export function AiSettingsForm(p: Props) {
  const [state, action, pending] = useActionState<AiSettingsState, FormData>(saveAiSettings, {});

  return (
    <form action={action} className="mt-8 space-y-6">
      {state.error && (
        <p role="alert" className="rounded-md border px-3 py-2 text-sm"
           style={{ borderColor: "var(--critical)", color: "var(--critical)" }}>
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="rounded-md border px-3 py-2 text-sm"
           style={{ borderColor: "var(--good)", color: "var(--good)" }}>
          Saved.
        </p>
      )}

      <label className="flex items-center gap-3 text-sm font-medium">
        <input type="checkbox" name="enabled" defaultChecked={p.enabled} className="h-5 w-5" />
        Assistant enabled
      </label>

      <div>
        <label htmlFor="model" className="block text-sm font-medium">Model</label>
        <select id="model" name="model" defaultValue={p.model} className={FIELD} style={FIELD_STYLE}>
          {p.models.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="apiKey" className="block text-sm font-medium">Anthropic API key</label>
        <p className="text-xs" style={{ color: "var(--faint)" }}>
          {p.envKey
            ? "ANTHROPIC_API_KEY is set on the server and takes precedence over anything stored here."
            : p.hasStoredKey
              ? p.storedKeyReadable
                ? `A key ending in …${p.keyLast4 ?? "????"} is stored, encrypted. Leave blank to keep it.`
                : "A key is stored but can no longer be decrypted (the encryption secret changed). Enter it again."
              : "No key stored yet. It is encrypted before it is saved and never shown again."}
        </p>
        <input id="apiKey" name="apiKey" type="password" autoComplete="off" spellCheck={false}
          placeholder="sk-ant-…" className={FIELD} style={FIELD_STYLE} />
        {p.hasStoredKey && (
          <label className="mt-2 flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
            <input type="checkbox" name="removeKey" /> Remove the stored key
          </label>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="monthlyBudgetUsd" className="block text-sm font-medium">Monthly budget (USD)</label>
          <p className="text-xs" style={{ color: "var(--faint)" }}>
            At this figure the assistant stops itself until next month and says so.
          </p>
          <input id="monthlyBudgetUsd" name="monthlyBudgetUsd" type="number" min={0} step="0.01"
            defaultValue={p.monthlyBudgetUsd} className={FIELD} style={FIELD_STYLE} />
        </div>
        <div>
          <label htmlFor="hourlyLimit" className="block text-sm font-medium">Questions per person per hour</label>
          <p className="text-xs" style={{ color: "var(--faint)" }}>Rate limit, per signed-in user.</p>
          <input id="hourlyLimit" name="hourlyLimit" type="number" min={1} max={500}
            defaultValue={p.hourlyLimit} className={FIELD} style={FIELD_STYLE} />
        </div>
      </div>

      <button type="submit" disabled={pending}
        className="rounded-md px-5 text-sm font-medium disabled:opacity-50"
        style={{ minHeight: 44, background: "var(--foreground)", color: "var(--background)" }}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
