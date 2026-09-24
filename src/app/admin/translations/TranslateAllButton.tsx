"use client";

import { useActionState, useTransition } from "react";
import { translateAllMissing, type TranslationState } from "./actions";

export function TranslateAllButton() {
  const [state, dispatch] = useActionState<TranslationState, FormData>(translateAllMissing, {});
  const [pending, start] = useTransition();
  return (
    <div className="mt-4">
      <button type="button" disabled={pending} onClick={() => start(() => dispatch(new FormData()))}
        className="rounded-md px-5 text-sm font-medium disabled:opacity-50"
        style={{ minHeight: 44, background: "var(--foreground)", color: "var(--background)" }}>
        {pending ? "Starting…" : "Translate everything missing now"}
      </button>
      {state.error && <p role="alert" className="mt-2 text-sm" style={{ color: "var(--critical)" }}>{state.error}</p>}
      {state.ok && !pending && <p role="status" className="mt-2 text-sm" style={{ color: "var(--good)" }}>{state.ok}</p>}
    </div>
  );
}
