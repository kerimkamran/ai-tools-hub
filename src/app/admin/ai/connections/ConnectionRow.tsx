"use client";

import { useActionState, useTransition } from "react";
import { ActionMenu, type ActionItem } from "@/components/admin/ActionMenu";
import { connectionAction, type ConnState } from "../actions";

export type ConnectionRowView = {
  id: number;
  label: string;
  providerName: string;
  adapter: boolean;
  keyLast4: string | null;
  keyReadable: boolean;
  envManaged: boolean;
  enabled: boolean;
  usedBy: string[];
  freePurposes: Array<{ id: string; label: string }>;
  createdBy: string | null;
  lastUsedAt: string | null;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "never");

export function ConnectionRow({ c }: { c: ConnectionRowView }) {
  const [state, dispatch] = useActionState<ConnState, FormData>(connectionAction, {});
  const [pending, start] = useTransition();
  const run = (op: string, extra: Record<string, string> = {}) => {
    const fd = new FormData();
    fd.set("op", op);
    fd.set("id", String(c.id));
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    start(() => dispatch(fd));
  };

  const items: ActionItem[] = [
    { label: "Edit", href: `/admin/ai/connections/${c.id}` },
    { label: "Test connection", onSelect: () => run("test") },
    { label: c.enabled ? "Disable" : "Enable", onSelect: () => run(c.enabled ? "disable" : "enable") },
  ];
  if (c.adapter) {
    for (const p of c.freePurposes) items.push({ label: `Use for ${p.label}`, onSelect: () => run("set_default", { purpose: p.id }) });
  }
  items.push({
    label: "Delete",
    destructive: true,
    confirm: { prompt: c.usedBy.length ? `In use by ${c.usedBy.join(" and ")} — move it first. Type ${c.label} to try anyway` : `Type ${c.label} to delete this connection and its key`, expected: c.label },
    onSelect: (v) => run("delete", { confirm: v ?? "" }),
  });

  const status = !c.enabled
    ? { text: "Disabled", color: "var(--faint)" }
    : !c.keyReadable
      ? { text: "No readable key", color: "var(--critical)" }
      : c.lastTestOk === false
        ? { text: "Last test failed", color: "var(--critical)" }
        : c.lastTestOk
          ? { text: "Working", color: "var(--good)" }
          : { text: "Not tested", color: "var(--warning)" };

  return (
    <li className="rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {c.label} <span className="font-normal" style={{ color: "var(--muted)" }}>· {c.providerName}</span>
          </p>
          <p className="flex flex-wrap gap-x-2 text-xs" style={{ color: "var(--faint)" }}>
            <span style={{ color: status.color }}>● {status.text}</span>
            <span>·</span>
            <span>{c.envManaged ? `key managed by environment (…${c.keyLast4})` : c.keyLast4 ? `key …${c.keyLast4}` : "no key"}</span>
            <span>·</span>
            <span>{c.usedBy.length ? `serves ${c.usedBy.join(", ")}` : c.adapter ? "not in use" : "stored only (no adapter yet)"}</span>
          </p>
          <p className="text-xs" style={{ color: "var(--faint)" }}>
            Added by {c.createdBy ?? "—"} · last used {when(c.lastUsedAt)} · last tested {when(c.lastTestedAt)}
            {c.lastTestMessage ? ` (${c.lastTestMessage})` : ""}
          </p>
        </div>
        <ActionMenu items={items} label={`Actions for connection ${c.label}`} />
      </div>
      {pending && <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>Working…</p>}
      {state.error && !pending && <p role="alert" className="mt-2 text-xs" style={{ color: "var(--critical)" }}>{state.error}</p>}
      {state.ok && !pending && <p role="status" className="mt-2 text-xs" style={{ color: "var(--good)" }}>{state.ok}</p>}
    </li>
  );
}
