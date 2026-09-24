"use client";

import { useKeepAction } from "@/components/admin/useKeepAction";
import { savePolicy, type PolicyState } from "./actions";

const FIELD = "mt-1 w-32 rounded-md border px-3 py-2 text-sm outline-none";
const FIELD_STYLE = { borderColor: "var(--control-border)", background: "var(--surface)", color: "var(--foreground)" };

type P = {
  idleMinutes: number;
  absoluteHours: number;
  mfaRequiredAdmins: boolean;
  lockoutThreshold: number;
  lockoutMinutes: number;
};

export function PolicyForm({ policy, bounds }: { policy: P; bounds: Record<string, readonly [number, number]> }) {
  const [state, action, pending] = useKeepAction<PolicyState>(savePolicy, {});
  const num = (name: keyof P, label: string, unit: string) => {
    const [min, max] = bounds[name];
    return (
      <div>
        <label htmlFor={name} className="block text-sm font-medium">{label}</label>
        <div className="flex items-center gap-2">
          <input id={name} name={name} type="number" min={min} max={max} required
            defaultValue={Number(policy[name])} className={FIELD} style={FIELD_STYLE} />
          <span className="text-xs" style={{ color: "var(--faint)" }}>{unit} ({min}–{max})</span>
        </div>
      </div>
    );
  };
  return (
    <form onSubmit={action} className="mt-8 space-y-6">
      <label className="flex items-center gap-3 text-sm font-medium">
        <input type="checkbox" name="mfaRequiredAdmins" defaultChecked={policy.mfaRequiredAdmins} className="h-5 w-5" />
        Require two-step verification for all admins and editors
      </label>
      <p className="-mt-4 text-xs" style={{ color: "var(--faint)" }}>Always required for super admins, whatever this says.</p>

      <details className="rounded-lg border p-4" style={{ borderColor: "var(--line)" }}>
        <summary className="cursor-pointer text-sm font-medium">Advanced</summary>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          {num("idleMinutes", "Sign out after inactivity", "minutes")}
          {num("absoluteHours", "Sign out after, regardless", "hours")}
          {num("lockoutThreshold", "Lock after failed attempts", "attempts")}
          {num("lockoutMinutes", "Lock for", "minutes")}
        </div>
      </details>

      {state.error && <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>{state.error}</p>}
      {state.ok && <p role="status" className="text-sm" style={{ color: "var(--good)" }}>Saved. Applies to every session on its next request.</p>}
      <button type="submit" disabled={pending}
        className="rounded-md px-5 text-sm font-medium disabled:opacity-50"
        style={{ minHeight: 44, background: "var(--foreground)", color: "var(--background)" }}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
