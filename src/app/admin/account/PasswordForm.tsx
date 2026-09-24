"use client";

import { useActionState } from "react";
import { changePassword, type PasswordState } from "./actions";

const FIELD = "mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none";
const FIELD_STYLE = { borderColor: "var(--control-border)", background: "var(--surface)" };

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePassword, {});
  return (
    <form action={action} className="mt-6 space-y-4">
      {[
        { id: "current", label: "Current password", auto: "current-password" },
        { id: "next", label: "New password (at least 12 characters)", auto: "new-password" },
        { id: "confirm", label: "Confirm new password", auto: "new-password" },
      ].map((f) => (
        <div key={f.id}>
          <label htmlFor={f.id} className="block text-sm" style={{ color: "var(--muted)" }}>{f.label}</label>
          <input id={f.id} name={f.id} type="password" required autoComplete={f.auto}
            minLength={f.id === "current" ? undefined : 12} className={FIELD} style={FIELD_STYLE} />
        </div>
      ))}
      {state.error && (
        <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>{state.error}</p>
      )}
      {state.ok && (
        <p role="status" className="text-sm" style={{ color: "var(--good)" }}>
          Password changed. Use the new one next time you sign in.
        </p>
      )}
      <button type="submit" disabled={pending}
        className="rounded-md px-5 text-sm font-medium disabled:opacity-50"
        style={{ minHeight: 44, background: "var(--foreground)", color: "var(--background)" }}>
        {pending ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
