"use client";

import { useActionState, useState, useTransition } from "react";
import { ActionMenu, type ActionItem } from "@/components/admin/ActionMenu";
import { ToolIcon } from "@/components/ToolIcon";
import { catalogAction, type CatalogState } from "./actions";

export type CatalogRowView = {
  id: string;
  name: string;
  icon: string;
  hasIconImage: boolean;
  iconVersion: string;
  maintenance: string | null;
  slug: string;
  category: string;
  status: "draft" | "published" | "planned" | "unlisted" | "archived";
  statusLabel: string;
  featured: boolean;
  hasHealthUrl: boolean;
  health: { label: string; color: string; when: string } | null;
  translation: { label: string; color: string } | null;
  canEdit: boolean;
  canOpen: boolean;
  canDuplicate: boolean;
  first: boolean;
  last: boolean;
};

const STATUS_COLOR: Record<CatalogRowView["status"], string> = {
  published: "var(--good)",
  planned: "var(--muted)",
  unlisted: "var(--warning)",
  draft: "var(--faint)",
  archived: "var(--faint)",
};

export function CatalogRow({ t }: { t: CatalogRowView }) {
  const [state, dispatch] = useActionState<CatalogState, FormData>(catalogAction, {});
  const [pending, start] = useTransition();
  const [maint, setMaint] = useState(false);
  const run = (op: string, confirm?: string, extra: Record<string, string> = {}) => {
    const fd = new FormData();
    fd.set("op", op);
    fd.set("id", t.id);
    if (confirm) fd.set("confirm", confirm);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    start(() => dispatch(fd));
  };

  const items: ActionItem[] = [{ label: "Preview", href: `/admin/tools/${t.id}/preview` }];
  if (t.canOpen) items.push({ label: "Edit", href: `/admin/tools/${t.id}` });
  if (t.canDuplicate) items.push({ label: "Duplicate as draft", onSelect: () => run("duplicate") });
  if (t.canEdit) {
    if (t.status !== "published") items.push({ label: "Publish", onSelect: () => run("publish") });
    if (t.status !== "unlisted" && t.status !== "draft") items.push({ label: "Unlist (link only)", onSelect: () => run("unlist") });
    if (t.status !== "draft") items.push({ label: "Move back to draft", onSelect: () => run("to_draft") });
    items.push({ label: t.featured ? "Unfeature" : "Feature (pin to top)", onSelect: () => run(t.featured ? "unfeature" : "feature") });
    if (!t.first) items.push({ label: "Move up", onSelect: () => run("up") });
    if (!t.last) items.push({ label: "Move down", onSelect: () => run("down") });
    if (t.hasHealthUrl && !t.maintenance) items.push({ label: "Check health now", onSelect: () => run("check_health") });
    items.push({ label: t.maintenance ? "Change maintenance…" : "Maintenance mode…", onSelect: () => setMaint(true) });
    if (t.maintenance) items.push({ label: "End maintenance", onSelect: () => run("end_maintenance") });
    if (t.status !== "archived") {
      items.push({
        label: "Archive",
        destructive: true,
        confirm: { prompt: `Type ${t.id} to archive — the public page disappears`, expected: t.id },
        onSelect: () => run("archive"),
      });
    }
    items.push({
      label: "Delete",
      destructive: true,
      confirm: { prompt: `Type ${t.id} to delete permanently`, expected: t.id },
      onSelect: (v) => run("delete", v),
    });
  }

  return (
    <li className="rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="leading-none"><ToolIcon tool={t} size={22} admin /></span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {t.featured && <span title="Featured" aria-label="Featured">★ </span>}
              {t.name}
            </p>
            <p className="flex flex-wrap items-center gap-x-2 text-xs" style={{ color: "var(--faint)" }}>
              <span style={{ color: STATUS_COLOR[t.status] }}>● {t.statusLabel}</span>
              <span aria-hidden="true">·</span>
              <span>/{t.slug}</span>
              <span aria-hidden="true">·</span>
              <span>{t.category}</span>
              {t.health && (
                <>
                  <span aria-hidden="true">·</span>
                  <span style={{ color: t.health.color }} title={t.health.when}>
                    Health: {t.health.label}
                  </span>
                </>
              )}
              {t.maintenance && (
                <>
                  <span aria-hidden="true">·</span>
                  <span style={{ color: "var(--warning)" }}>🔧 Maintenance: {t.maintenance}</span>
                </>
              )}
              {t.translation && (
                <>
                  <span aria-hidden="true">·</span>
                  <span style={{ color: t.translation.color }}>{t.translation.label}</span>
                </>
              )}
            </p>
          </div>
        </div>
        <ActionMenu items={items} label={`Actions for ${t.name}`} />
      </div>
      {maint && (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run("maintenance", undefined, { message: String(fd.get("message") ?? ""), until: String(fd.get("until") ?? "") });
            setMaint(false);
          }}
        >
          <label className="min-w-[240px] flex-1 text-xs" style={{ color: "var(--muted)" }}>
            Message for visitors (English — translated automatically)
            <input name="message" required maxLength={200} autoFocus placeholder="Upgrading to a new version, back soon."
              className="mt-1 block w-full rounded-md border px-3 text-sm" style={{ minHeight: 44, borderColor: "var(--control-border)", background: "var(--surface)" }} />
          </label>
          <label className="text-xs" style={{ color: "var(--muted)" }}>
            Until (last day, optional)
            <input name="until" type="date" className="mt-1 block rounded-md border px-3 text-sm" style={{ minHeight: 44, borderColor: "var(--control-border)", background: "var(--surface)" }} />
          </label>
          <button type="submit" className="rounded-md border px-4 text-sm" style={{ minHeight: 44, borderColor: "var(--control-border)" }}>Turn on</button>
          <button type="button" onClick={() => setMaint(false)} className="rounded-md px-3 text-sm" style={{ minHeight: 44, color: "var(--muted)" }}>Cancel</button>
        </form>
      )}
      {pending && <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>Working…</p>}
      {state.error && <p role="alert" className="mt-2 text-xs" style={{ color: "var(--critical)" }}>{state.error}</p>}
      {state.ok && !pending && <p role="status" className="mt-2 text-xs" style={{ color: "var(--good)" }}>{state.ok}</p>}
    </li>
  );
}
