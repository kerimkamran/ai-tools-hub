"use client";

import { useActionState, useState, useTransition } from "react";
import { ActionMenu, type ActionItem } from "@/components/admin/ActionMenu";
import { categoryAction, type CategoryOpState } from "./actions";

type Row = { name: string; toolCount: number; translation: string | null };

const FIELD = "rounded-md border px-3 text-sm outline-none";
const FIELD_STYLE = { minHeight: 44, borderColor: "var(--control-border)", background: "var(--surface)", color: "var(--foreground)" };
const SECONDARY = { minHeight: 44, borderColor: "var(--control-border)", color: "var(--foreground)" };

function Status({ state, pending }: { state: CategoryOpState; pending: boolean }) {
  if (pending) return <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>Working…</p>;
  if (state.error) return <p role="alert" className="mt-2 text-xs" style={{ color: "var(--critical)" }}>{state.error}</p>;
  if (state.ok) return <p role="status" className="mt-2 text-xs" style={{ color: "var(--good)" }}>{state.ok}</p>;
  return null;
}

function CategoryRow({ r, others, first, last }: { r: Row; others: string[]; first: boolean; last: boolean }) {
  const [state, dispatch] = useActionState<CategoryOpState, FormData>(categoryAction, {});
  const [pending, start] = useTransition();
  const [panel, setPanel] = useState<"rename" | "merge" | null>(null);
  const run = (op: string, extra: Record<string, string> = {}) => {
    const fd = new FormData();
    fd.set("op", op);
    fd.set("name", r.name);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    start(() => dispatch(fd));
  };

  const items: ActionItem[] = [{ label: "Rename…", onSelect: () => setPanel("rename") }];
  if (!first) items.push({ label: "Move up", onSelect: () => run("up") });
  if (!last) items.push({ label: "Move down", onSelect: () => run("down") });
  if (others.length) items.push({ label: "Merge into…", onSelect: () => setPanel("merge") });
  if (r.toolCount === 0) {
    items.push({
      label: "Delete",
      destructive: true,
      confirm: { prompt: `Type ${r.name} to delete this unused category`, expected: r.name },
      onSelect: () => run("delete"),
    });
  }

  return (
    <li className="rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{r.name}</p>
          <p className="text-xs" style={{ color: "var(--faint)" }}>
            {r.toolCount} {r.toolCount === 1 ? "tool" : "tools"}
            {r.translation && <span style={{ color: "var(--warning)" }}> · {r.translation}</span>}
          </p>
        </div>
        <ActionMenu items={items} label={`Actions for category ${r.name}`} />
      </div>

      {panel === "rename" && (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run("rename", { newName: String(new FormData(e.currentTarget).get("newName") ?? "") });
            setPanel(null);
          }}
        >
          <label className="text-xs" style={{ color: "var(--muted)" }}>
            New name (updates every tool in it)
            <input name="newName" defaultValue={r.name} maxLength={40} autoFocus className={`mt-1 block ${FIELD}`} style={FIELD_STYLE} />
          </label>
          <button type="submit" className="rounded-md border px-4 text-sm" style={SECONDARY}>Rename</button>
          <button type="button" onClick={() => setPanel(null)} className="rounded-md px-3 text-sm" style={{ minHeight: 44, color: "var(--muted)" }}>Cancel</button>
        </form>
      )}

      {panel === "merge" && (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run("merge", { into: String(fd.get("into") ?? ""), confirm: String(fd.get("confirm") ?? "") });
            setPanel(null);
          }}
        >
          <label className="text-xs" style={{ color: "var(--muted)" }}>
            Move all tools into
            <select name="into" className={`mt-1 block ${FIELD}`} style={FIELD_STYLE}>
              {others.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label className="text-xs" style={{ color: "var(--muted)" }}>
            Type {r.name} to confirm
            <input name="confirm" autoComplete="off" className={`mt-1 block ${FIELD}`} style={FIELD_STYLE} />
          </label>
          <button type="submit" className="rounded-md border px-4 text-sm" style={{ ...SECONDARY, color: "var(--critical)" }}>Merge</button>
          <button type="button" onClick={() => setPanel(null)} className="rounded-md px-3 text-sm" style={{ minHeight: 44, color: "var(--muted)" }}>Cancel</button>
        </form>
      )}
      <Status state={state} pending={pending} />
    </li>
  );
}

export function CategoryManager({ rows }: { rows: Row[] }) {
  const [state, dispatch] = useActionState<CategoryOpState, FormData>(categoryAction, {});
  const [pending, start] = useTransition();
  return (
    <section className="mt-10">
      <h2 className="text-base font-semibold">Order and names</h2>
      <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
        The filter chips on the public site follow this order.
      </p>
      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);
          fd.set("op", "create");
          start(() => dispatch(fd));
          form.reset();
        }}
      >
        <label className="text-xs" style={{ color: "var(--muted)" }}>
          New category (English)
          <input name="newName" maxLength={40} required className={`mt-1 block ${FIELD}`} style={FIELD_STYLE} />
        </label>
        <button type="submit" className="rounded-md border px-4 text-sm" style={SECONDARY}>+ Add category</button>
      </form>
      <Status state={state} pending={pending} />
      <ul className="mt-4 list-none space-y-2 p-0">
        {rows.map((r, i) => (
          <CategoryRow key={r.name} r={r} first={i === 0} last={i === rows.length - 1} others={rows.map((o) => o.name).filter((n) => n !== r.name)} />
        ))}
      </ul>
    </section>
  );
}
