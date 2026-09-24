"use client";

import { useKeepAction } from "@/components/admin/useKeepAction";
import { saveAiSettings, type AiSettingsState } from "./actions";

type Props = {
  enabled: boolean;
  monthlyBudgetUsd: number;
  hourlyLimit: number;
  dailyLimit: number;
  storeTranscripts: boolean;
  autoTranslate: boolean;
};

const FIELD = "mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none";
const FIELD_STYLE = { borderColor: "var(--control-border)", background: "var(--surface)", color: "var(--foreground)" };

export function AiSettingsForm(p: Props) {
  const [state, action, pending] = useKeepAction<AiSettingsState>(saveAiSettings, {});

  return (
    <form onSubmit={action} className="mt-8 space-y-6">
      {state.error && (
        <p role="alert" className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: "var(--critical)", color: "var(--critical)" }}>
          {state.error}
        </p>
      )}
      {state.ok && !pending && (
        <p role="status" className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: "var(--good)", color: "var(--good)" }}>
          Saved.
        </p>
      )}

      <label className="flex items-center gap-3 text-sm font-medium" style={{ minHeight: 44 }}>
        <input type="checkbox" name="enabled" defaultChecked={p.enabled} className="h-5 w-5" />
        Assistant enabled
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="monthlyBudgetUsd" className="block text-sm font-medium">Monthly budget (USD)</label>
          <input id="monthlyBudgetUsd" name="monthlyBudgetUsd" type="number" min={0} step="0.01" defaultValue={p.monthlyBudgetUsd} className={FIELD} style={FIELD_STYLE} />
          <p className="mt-1 text-xs" style={{ color: "var(--faint)" }}>Everything AI stops at 100%.</p>
        </div>
        <div>
          <label htmlFor="hourlyLimit" className="block text-sm font-medium">Questions per person per hour</label>
          <input id="hourlyLimit" name="hourlyLimit" type="number" min={1} max={500} defaultValue={p.hourlyLimit} className={FIELD} style={FIELD_STYLE} />
        </div>
        <div>
          <label htmlFor="dailyLimit" className="block text-sm font-medium">Questions per person per day</label>
          <input id="dailyLimit" name="dailyLimit" type="number" min={1} max={5000} defaultValue={p.dailyLimit} className={FIELD} style={FIELD_STYLE} />
        </div>
      </div>

      <label className="flex items-start gap-3 text-sm" style={{ minHeight: 44 }}>
        <input type="checkbox" name="autoTranslate" defaultChecked={p.autoTranslate} className="mt-0.5 h-5 w-5" />
        <span>
          Translate new English automatically
          <span className="block text-xs" style={{ color: "var(--muted)" }}>
            After each save, new or changed English is translated into Azərbaycanca and Русский through the
            “Translation drafts” connection. Counts against the budget above; each change is translated once.
          </span>
        </span>
      </label>

      <fieldset className="rounded-lg border p-4" style={{ borderColor: "var(--line)" }}>
        <legend className="px-1 text-sm font-medium">Conversation insights</legend>
        <label className="flex items-start gap-3 text-sm" style={{ minHeight: 44 }}>
          <input type="checkbox" name="storeTranscripts" defaultChecked={p.storeTranscripts} className="mt-0.5 h-5 w-5" />
          <span>
            Keep question and answer text for 30 days
            <span className="block text-xs" style={{ color: "var(--muted)" }}>
              Off by default. Text is stored without the asker&apos;s name or email, is visible to super admins only,
              and is deleted after 30 days. Staff see a notice on the assistant page while this is on. Switching it
              off deletes everything kept so far. Thumbs ratings are counted either way.
            </span>
          </span>
        </label>
      </fieldset>

      <button type="submit" disabled={pending} className="rounded-md px-5 text-sm font-medium disabled:opacity-50"
        style={{ minHeight: 44, background: "var(--foreground)", color: "var(--background)" }}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
