"use client";

import { useState } from "react";
import { useKeepAction } from "@/components/admin/useKeepAction";
import { savePurposes, type ConnState } from "../actions";

type Conn = { id: number; label: string; models: Array<{ id: string; label: string }> };
const FIELD = "mt-1 w-full rounded-md border px-3 text-sm outline-none";
const STYLE = { minHeight: 44, borderColor: "var(--control-border)", background: "var(--surface)", color: "var(--foreground)" };

export function PurposesForm(props: {
  purposes: Array<{ id: string; label: string; hint: string }>;
  current: Record<string, { connectionId: number | null; model: string }>;
  connections: Conn[];
}) {
  const [state, onSubmit, pending] = useKeepAction<ConnState>(savePurposes, {});
  const [picked, setPicked] = useState<Record<string, number>>(
    Object.fromEntries(props.purposes.map((p) => [p.id, props.current[p.id]?.connectionId ?? props.connections[0]?.id ?? 0]))
  );
  if (props.connections.length === 0) {
    return <p className="mt-3 text-sm" style={{ color: "var(--warning)" }}>Add an Anthropic connection to power the assistant and translation drafts.</p>;
  }
  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-4">
      {props.purposes.map((p) => {
        const conn = props.connections.find((c) => c.id === picked[p.id]) ?? props.connections[0];
        const current = props.current[p.id]?.model;
        return (
          <fieldset key={p.id} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2" style={{ borderColor: "var(--line)" }}>
            <legend className="px-1 text-sm font-medium">{p.label}</legend>
            <p className="text-xs sm:col-span-2" style={{ color: "var(--muted)" }}>{p.hint}</p>
            <label className="text-xs" style={{ color: "var(--muted)" }}>
              Connection
              <select name={`conn:${p.id}`} value={conn.id} onChange={(e) => setPicked({ ...picked, [p.id]: Number(e.target.value) })} className={FIELD} style={STYLE}>
                {props.connections.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
            <label className="text-xs" style={{ color: "var(--muted)" }}>
              Model
              <select key={conn.id} name={`model:${p.id}`} defaultValue={conn.models.some((m) => m.id === current) ? current : conn.models[0].id} className={FIELD} style={STYLE}>
                {conn.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
          </fieldset>
        );
      })}
      {state.error && <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>{state.error}</p>}
      {state.ok && !pending && <p role="status" className="text-sm" style={{ color: "var(--good)" }}>{state.ok}</p>}
      <button type="submit" disabled={pending} className="rounded-md border px-5 text-sm font-medium disabled:opacity-50"
        style={{ minHeight: 44, borderColor: "var(--control-border)", color: "var(--foreground)" }}>
        {pending ? "Saving…" : "Save purposes"}
      </button>
    </form>
  );
}
