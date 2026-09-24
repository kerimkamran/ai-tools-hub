"use client";

import { useActionState, useTransition } from "react";
import { ActionMenu } from "@/components/admin/ActionMenu";
import { discardDraft, publishDraft, type StudioState } from "../actions";

export function PublishPanel({ hasDraft, failures }: { hasDraft: boolean; failures: string[] }) {
  const [state, dispatch] = useActionState<StudioState, FormData>(publishDraft, {});
  const [dState, dDispatch] = useActionState<StudioState, FormData>(discardDraft, {});
  const [pending, start] = useTransition();
  const blocked = failures.length > 0;
  return (
    <div className="mt-4 rounded-lg border p-4" style={{ borderColor: blocked ? "var(--critical)" : "var(--line)" }}>
      {blocked ? (
        <>
          <p className="text-sm font-medium" style={{ color: "var(--critical)" }}>This palette fails the contrast gate and cannot be published:</p>
          <ul className="mt-1 list-disc pl-5 text-xs" style={{ color: "var(--critical)" }}>{failures.map((f) => <li key={f}>{f}</li>)}</ul>
        </>
      ) : (
        <p className="text-sm" style={{ color: "var(--good)" }}>Contrast gate passed.</p>
      )}
      {hasDraft && (
        <div className="mt-3 flex items-center gap-3">
          <button type="button" disabled={blocked || pending} onClick={() => start(() => dispatch(new FormData()))}
            className="rounded-md px-5 text-sm font-medium disabled:opacity-40" style={{ minHeight: 44, background: "var(--foreground)", color: "var(--background)" }}>
            {pending ? "Publishing…" : "Publish"}
          </button>
          <ActionMenu label="More draft actions" items={[{
            label: "Discard draft", destructive: true,
            confirm: { prompt: "Type discard to throw the draft away", expected: "discard" },
            onSelect: () => start(() => dDispatch(new FormData())),
          }]} />
        </div>
      )}
      {(state.error || dState.error) && <p role="alert" className="mt-2 text-sm" style={{ color: "var(--critical)" }}>{state.error ?? dState.error}</p>}
      {state.warnings && <ul className="mt-1 list-disc pl-5 text-xs" style={{ color: "var(--critical)" }}>{state.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      {(state.ok || dState.ok) && !pending && <p role="status" className="mt-2 text-sm" style={{ color: "var(--good)" }}>{state.ok ?? dState.ok}</p>}
    </div>
  );
}
