"use client";

import { useActionState } from "react";
import { inviteAdmin, type InviteState } from "./actions";

export function InviteForm() {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteAdmin, {});

  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <div className="flex-1">
        <label htmlFor="invite-email" className="sr-only">
          Email to invite
        </label>
        <input
          id="invite-email"
          name="email"
          type="email"
          required
          placeholder="name@company.com"
          className="w-full rounded-md border px-3 py-2 text-sm outline-none"
          style={{ borderColor: "var(--control-border)", background: "var(--surface)" }}
        />
        {state.error && (
          <p role="alert" className="mt-1 text-xs" style={{ color: "var(--critical)" }}>
            {state.error}
          </p>
        )}
        {state.ok && (
          <p className="mt-1 text-xs" style={{ color: "var(--good)" }}>
            Invite sent. They will receive a one-time link to set their own password.
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
        style={{ background: "var(--foreground)", color: "var(--background)", minHeight: 38 }}
      >
        {pending ? "Sending…" : "Invite"}
      </button>
    </form>
  );
}
