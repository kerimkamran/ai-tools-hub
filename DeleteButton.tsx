"use client";

import { useActionState } from "react";
import { deleteTool, type DeleteState } from "./actions";

export function DeleteButton({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState<DeleteState, FormData>(deleteTool, {});

  return (
    <form action={action} className="flex flex-col items-end">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="rounded border px-3 py-1.5 text-xs disabled:opacity-50"
        style={{ borderColor: "var(--control-border)", color: "var(--critical)" }}
      >
        {pending ? "Deleting…" : "Delete"}
        <span className="sr-only"> {name}</span>
      </button>
      {state.error && (
        <p role="alert" className="mt-1 text-xs" style={{ color: "var(--critical)" }}>
          {state.error}
        </p>
      )}
    </form>
  );
}
