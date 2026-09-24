"use client";

import { useActionState, useState, useTransition } from "react";
import { ActionMenu, type ActionItem } from "@/components/admin/ActionMenu";
import { deleteArticle, restoreVersion, type KbState } from "../actions";

type Version = { id: number; savedAt: string; savedBy: string | null; title: string; body: string; status: string; chars: number };

export function KbHistory({ articleId, versions, canRestore }: { articleId: number; versions: Version[]; canRestore: boolean }) {
  const [state, dispatch] = useActionState<KbState, FormData>(restoreVersion, {});
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<number | null>(null);

  return (
    <section className="mt-12 border-t pt-6" style={{ borderColor: "var(--line)" }}>
      <h2 className="text-base font-semibold">History</h2>
      <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
        Every save is kept (latest 50). Restoring makes a new save, so it can be undone too.
      </p>
      {state.error && <p role="alert" className="mt-2 text-xs" style={{ color: "var(--critical)" }}>{state.error}</p>}
      {pending && <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>Restoring…</p>}
      <ul className="mt-3 list-none space-y-2 p-0">
        {versions.map((v, i) => {
          const items: ActionItem[] = [{ label: preview === v.id ? "Hide preview" : "Preview", onSelect: () => setPreview(preview === v.id ? null : v.id) }];
          if (canRestore && i > 0) {
            items.push({
              label: "Restore this version",
              onSelect: () => {
                const fd = new FormData();
                fd.set("versionId", String(v.id));
                fd.set("articleId", String(articleId));
                start(() => dispatch(fd));
              },
            });
          }
          return (
            <li key={v.id} className="rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm">
                    {new Date(v.savedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                    {i === 0 && <span className="ml-2 text-xs" style={{ color: "var(--good)" }}>current</span>}
                  </p>
                  <p className="truncate text-xs" style={{ color: "var(--faint)" }}>
                    {v.savedBy ?? "unknown"} · {v.status} · {v.chars.toLocaleString()} characters · “{v.title}”
                  </p>
                </div>
                <ActionMenu items={items} label={`Actions for version saved ${v.savedAt}`} />
              </div>
              {preview === v.id && (
                <div className="mt-3 rounded-md p-3 text-sm" style={{ background: "var(--surface-sunken)" }}>
                  <p className="font-medium">{v.title}</p>
                  <p className="mt-2 whitespace-pre-wrap" style={{ color: "var(--muted)", maxHeight: 360, overflow: "auto" }}>{v.body}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {versions.length === 0 && <p className="mt-3 text-xs" style={{ color: "var(--faint)" }}>No saved versions yet.</p>}
    </section>
  );
}

export function KbDelete({ id }: { id: number }) {
  const [state, dispatch] = useActionState<KbState, FormData>(deleteArticle, {});
  const [, start] = useTransition();
  return (
    <section className="mt-10 flex items-center justify-between gap-3 border-t pt-6" style={{ borderColor: "var(--line)" }}>
      <p className="text-sm" style={{ color: "var(--muted)" }}>Delete this article and its history.</p>
      <ActionMenu
        label="More actions for this article"
        items={[
          {
            label: "Delete article",
            destructive: true,
            confirm: { prompt: "Type delete to remove this article for good", expected: "delete" },
            onSelect: (v) => {
              const fd = new FormData();
              fd.set("id", String(id));
              fd.set("confirm", v ?? "");
              start(() => dispatch(fd));
            },
          },
        ]}
      />
      {state.error && <p role="alert" className="text-xs" style={{ color: "var(--critical)" }}>{state.error}</p>}
    </section>
  );
}
