"use client";

import { useKeepAction } from "@/components/admin/useKeepAction";
import Link from "next/link";
import { saveArticle, type KbState } from "../actions";

type Article = {
  id: number;
  title: string;
  body: string;
  i18n: Partial<Record<"az" | "ru", Partial<Record<"title" | "body", string>>>>;
  tags: string[];
  status: "draft" | "published";
  sortOrder: number;
};

const FIELD = "mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none";
const FIELD_STYLE = {
  borderColor: "var(--control-border)",
  background: "var(--surface)",
  color: "var(--foreground)",
};

function Err({ id, msg }: { id: string; msg?: string }) {
  if (!msg) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-xs" style={{ color: "var(--critical)" }}>
      {msg}
    </p>
  );
}

export function KbForm({ article, canPublish = true, defaultTitle }: { article: Article | null; canPublish?: boolean; defaultTitle?: string }) {
  const [state, action, pending] = useKeepAction<KbState>(saveArticle, {});
  const e = state.fieldErrors ?? {};

  return (
    <form onSubmit={action} className="mt-8 space-y-5">
      {article && <input type="hidden" name="id" value={article.id} />}
      {state.error && (
        <p role="alert" className="rounded-md border px-3 py-2 text-sm"
           style={{ borderColor: "var(--critical)", color: "var(--critical)" }}>
          {state.error}
        </p>
      )}

      <div>
        <label htmlFor="title" className="block text-sm font-medium">Title (English)</label>
        <input id="title" name="title" required maxLength={200} defaultValue={article?.title ?? defaultTitle}
          className={FIELD} style={FIELD_STYLE} aria-invalid={e.title ? true : undefined} />
        <Err id="title-error" msg={e.title} />
      </div>
      <div>
        <label htmlFor="body" className="block text-sm font-medium">Body (English)</label>
        <p className="text-xs" style={{ color: "var(--faint)" }}>
          Markdown. Write it as you would brief a new colleague — the assistant quotes and
          summarises from this.
        </p>
        <textarea id="body" name="body" rows={12} maxLength={20000} defaultValue={article?.body}
          className={FIELD} style={FIELD_STYLE} />
        <Err id="body-error" msg={e.body} />
      </div>

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Write in English. Azərbaycanca and Русский are translated automatically after you save
        {article ? " (check or correct them under Content → Translations)" : ""}.
      </p>

      <div className="grid gap-5 sm:grid-cols-3">
        <div className="sm:col-span-1">
          <label htmlFor="status" className="block text-sm font-medium">Status</label>
          <select id="status" name="status" defaultValue={article?.status ?? "draft"}
            className={FIELD} style={FIELD_STYLE}>
            <option value="draft">Draft — not used</option>
            {canPublish && <option value="published">Published — used by the assistant</option>}
          </select>
        </div>
        <div>
          <label htmlFor="sortOrder" className="block text-sm font-medium">Sort order</label>
          <input id="sortOrder" name="sortOrder" type="number" min={0} max={9999}
            defaultValue={String(article?.sortOrder ?? 0)} className={FIELD} style={FIELD_STYLE} />
        </div>
        <div>
          <label htmlFor="tags" className="block text-sm font-medium">Tags</label>
          <input id="tags" name="tags" defaultValue={article?.tags.join(", ")}
            placeholder="comma, separated" className={FIELD} style={FIELD_STYLE} />
        </div>
      </div>

      <div className="flex items-center gap-3 border-t pt-6" style={{ borderColor: "var(--line)" }}>
        <button type="submit" disabled={pending}
          className="rounded-md px-5 text-sm font-medium disabled:opacity-50"
          style={{ minHeight: 44, background: "var(--foreground)", color: "var(--background)" }}>
          {pending ? "Saving…" : "Save"}
        </button>
        <Link href="/admin/kb" className="text-sm underline underline-offset-4" style={{ color: "var(--muted)" }}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
