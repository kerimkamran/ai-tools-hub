"use client";

import { useActionState } from "react";
import { removeAdmin, type RemoveState } from "./actions";

export function RemoveButton({ email }: { email: string }) {
  const [state, action, pending] = useActionState<RemoveState, FormData>(removeAdmin, {});

  return (
    <form action={action} className="flex flex-col items-end">
      <input type="hidden" name="email" value={email} />
      <button
        type="submit"
        disabled={pending}
        className="rounded border px-3 py-1.5 text-xs disabled:opacity-50"
        style={{ borderColor: "var(--control-border)", color: "var(--critical)" }}
      >
        {pending ? "Removing…" : "Remove"}
        <span className="sr-only"> {email}</span>
      </button>
      {state.error && (
        <p role="alert" className="mt-1 text-xs" style={{ color: "var(--critical)" }}>
          {state.error}
        </p>
      )}
    </form>
  );
}
