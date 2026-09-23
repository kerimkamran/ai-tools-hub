"use client";

import { useActionState } from "react";
import { acceptInvite, type AcceptState } from "./actions";

export function AcceptInviteForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState<AcceptState, FormData>(acceptInvite, {});

  return (
    <form action={action} className="mt-8 space-y-3">
      <input type="hidden" name="token" value={token} />
      <div>
        <span className="block text-sm" style={{ color: "var(--muted)" }}>
          Email
        </span>
        <p className="mt-1 text-sm font-medium">{email}</p>
      </div>
      <div>
        <label htmlFor="password" className="block text-sm" style={{ color: "var(--muted)" }}>
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none"
          style={{ borderColor: "var(--control-border)", background: "var(--surface)" }}
        />
        <p className="mt-1 text-xs" style={{ color: "var(--faint)" }}>
          At least 12 characters.
        </p>
      </div>
      <div>
        <label htmlFor="confirm" className="block text-sm" style={{ color: "var(--muted)" }}>
          Confirm password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none"
          style={{ borderColor: "var(--control-border)", background: "var(--surface)" }}
        />
      </div>

      {state.error && (
        <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md px-4 text-sm font-medium disabled:opacity-50"
        style={{ minHeight: 44, background: "var(--foreground)", color: "var(--background)" }}
      >
        {pending ? "Setting password…" : "Set password and sign in"}
      </button>
    </form>
  );
}
