"use client";

import { useActionState } from "react";
import {
  changePassword,
  saveDisplayName,
  signOutEverywhere,
  type NameState,
  type PasswordState,
  type SignOutState,
} from "./actions";

const FIELD = "mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none";
const FIELD_STYLE = { borderColor: "var(--control-border)", background: "var(--surface)" };
const PRIMARY = { minHeight: 44, background: "var(--foreground)", color: "var(--background)" };

export function NameForm({ current }: { current: string }) {
  const [state, action, pending] = useActionState<NameState, FormData>(saveDisplayName, {});
  return (
    <form action={action} className="flex items-end gap-2">
      <div className="flex-1">
        <label htmlFor="displayName" className="block text-sm" style={{ color: "var(--muted)" }}>Display name</label>
        <input id="displayName" name="displayName" defaultValue={current} maxLength={80} className={FIELD} style={FIELD_STYLE} />
      </div>
      <button type="submit" disabled={pending} className="rounded-md border px-4 text-sm"
        style={{ minHeight: 44, borderColor: "var(--control-border)" }}>
        {state.ok ? "Saved" : "Save"}
      </button>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePassword, {});
  return (
    <form action={action} className="space-y-4">
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
      {state.error && <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>{state.error}</p>}
      {state.ok && (
        <p role="status" className="text-sm" style={{ color: "var(--good)" }}>
          Password changed. Every other session has been signed out.
        </p>
      )}
      <button type="submit" disabled={pending} className="rounded-md px-5 text-sm font-medium disabled:opacity-50" style={PRIMARY}>
        {pending ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}

export function SignOutEverywhereForm() {
  const [state, action, pending] = useActionState<SignOutState, FormData>(signOutEverywhere, {});
  return (
    <form action={action} className="space-y-2">
      <label className="block text-sm" style={{ color: "var(--muted)" }}>
        Type SIGN OUT to end every session of this account, including this one.
        <input name="confirm" className={FIELD} style={FIELD_STYLE} autoComplete="off" />
      </label>
      {state.error && <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>{state.error}</p>}
      <button type="submit" disabled={pending} className="rounded-md border px-5 text-sm"
        style={{ minHeight: 44, borderColor: "var(--critical)", color: "var(--critical)" }}>
        Sign out everywhere
      </button>
    </form>
  );
}
