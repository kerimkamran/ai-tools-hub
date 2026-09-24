"use client";

import { ActionMenu, type ActionItem } from "@/components/admin/ActionMenu";

export type KbRowView = {
  id: number;
  title: string;
  status: "draft" | "published";
  meta: string;
  translation: string | null;
  canEdit: boolean;
  canTranslate: boolean;
};

export function KbRow({ a }: { a: KbRowView }) {
  const items: ActionItem[] = [];
  if (a.canEdit) items.push({ label: "Edit & history", href: `/admin/kb/${a.id}` });
  if (a.canTranslate) items.push({ label: "Translations", href: `/admin/translations/kb/${a.id}` });
  return (
    <li className="flex items-center justify-between gap-4 rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{a.title}</p>
        <p className="truncate text-xs" style={{ color: "var(--faint)" }}>
          <span style={{ color: a.status === "published" ? "var(--good)" : "var(--faint)" }}>●</span> {a.meta}
        </p>
        {a.translation && <p className="text-xs" style={{ color: "var(--warning)" }}>{a.translation}</p>}
      </div>
      {items.length > 0 && <ActionMenu items={items} label={`Actions for ${a.title}`} />}
    </li>
  );
}
