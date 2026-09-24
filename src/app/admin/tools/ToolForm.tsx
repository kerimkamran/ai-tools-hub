"use client";

import { useKeepAction } from "@/components/admin/useKeepAction";
import Link from "next/link";
import { saveTool, type ActionState } from "../actions";
import type { Tool } from "@/lib/types";
import { ToolIconPicker } from "./ToolIconPicker";

const FIELD =
  "mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none";
const FIELD_STYLE = {
  borderColor: "var(--control-border)",
  background: "var(--surface)",
  color: "var(--foreground)",
};

function Field({
  label, name, defaultValue, error, hint, type = "text", required, ...rest
}: {
  label: string; name: string; defaultValue?: string; error?: string;
  hint?: string; type?: string; required?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">{label}</label>
      {hint && <p className="text-xs" style={{ color: "var(--faint)" }}>{hint}</p>}
      <input
        id={name} name={name} type={type} defaultValue={defaultValue}
        required={required} className={FIELD} style={FIELD_STYLE}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${name}-error` : undefined}
        {...rest}
      />
      {error && (
        <p id={`${name}-error`} role="alert" className="mt-1 text-xs" style={{ color: "var(--critical)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

function TextArea({
  label, name, defaultValue, error, hint, rows = 4,
}: {
  label: string; name: string; defaultValue?: string; error?: string; hint?: string; rows?: number;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">{label}</label>
      {hint && <p className="text-xs" style={{ color: "var(--faint)" }}>{hint}</p>}
      <textarea id={name} name={name} rows={rows}
        defaultValue={defaultValue} className={FIELD} style={FIELD_STYLE}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${name}-error` : undefined} />
      {error && (
        <p id={`${name}-error`} role="alert" className="mt-1 text-xs" style={{ color: "var(--critical)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * English only. Azerbaijani and Russian are translated automatically after
 * the save (src/lib/auto-translate.ts) and can be corrected on the
 * Translations page; this form never overwrites them.
 */
function EnglishFields({ tool, e }: { tool: Tool | null; e: Record<string, string> }) {
  return (
    <div className="space-y-5 rounded-lg border p-4" style={{ borderColor: "var(--line)" }}>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Write in English. Azərbaycanca and Русский are translated automatically after you save
        {tool ? (
          <>
            {" "}— to check or correct them, open{" "}
            <Link href={`/admin/translations/tool/${tool.id}`} className="underline underline-offset-4">Translations</Link>.
          </>
        ) : "."}
      </p>
      <Field label="Name" name="name" required defaultValue={tool?.name} error={e.name} />
      <Field label="Tagline" name="tagline" required defaultValue={tool?.tagline}
        error={e.tagline} maxLength={80}
        hint="Max 80 characters. Public writing — no internal codenames or client names." />
      <TextArea label="Description" name="description" defaultValue={tool?.description}
        error={e.description} hint="Shown on the detail page and used as the meta description." />
      <Field label="Access note" name="accessNote" defaultValue={tool?.accessNote ?? ""}
        error={e.accessNote}
        hint='One short line shown on the card, e.g. "@example.com accounts only".' />
    </div>
  );
}

export function ToolForm({ tool, canPublish = true }: { tool: Tool | null; canPublish?: boolean }) {
  const [state, action, pending] = useKeepAction<ActionState>(saveTool, {});
  const e = state.fieldErrors ?? {};

  return (
    <form onSubmit={action} className="mt-8 space-y-5">
      {/* The id the server will UPDATE. Sent from the route, not the visible
          id input -- readOnly is a client hint that still submits, so the
          server must not trust it. Absent on create, which selects insert(). */}
      {tool && <input type="hidden" name="originalId" value={tool.id} />}
      {state.error && (
        <p role="alert" className="rounded-md border px-3 py-2 text-sm"
           style={{ borderColor: "var(--critical)", color: "var(--critical)" }}>
          {state.error}
        </p>
      )}

      <Field label="ID" name="id" required defaultValue={tool?.id}
        readOnly={Boolean(tool)} error={e.id}
        hint="Stable, never reused. Lowercase letters, digits, hyphens." />

      <Field label="Slug" name="slug" required defaultValue={tool?.slug} error={e.slug}
        hint="URL segment for the detail page: /tools/<slug>" />

      <EnglishFields tool={tool} e={e} />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Category" name="category" required defaultValue={tool?.category}
          error={e.category} hint="English name; drives the filter chips and is translated automatically." />
      </div>

      <ToolIconPicker tool={tool} error={e.iconImage} />

      <Field label="Tags" name="tags" defaultValue={tool?.tags.join(", ")}
        hint="Comma-separated. Searched but not shown on the card — though they are in the page source, so treat them as public." />

      <Field label="URL" name="url" type="url" defaultValue={tool?.url} error={e.url}
        hint="Where the card points. Must be https. Required to publish." />

      <Field label="Health URL" name="healthUrl" type="url" defaultValue={tool?.healthUrl ?? ""}
        error={e.healthUrl}
        hint="Optional. Public https endpoint the server pings for a status badge. Private and loopback hosts are rejected." />

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="access" className="block text-sm font-medium">Access</label>
          <select id="access" name="access" defaultValue={tool?.access ?? "sign-in"}
            className={FIELD} style={FIELD_STYLE}
            aria-invalid={e.access ? true : undefined}>
            <option value="open">Open</option>
            <option value="sign-in">Sign-in required</option>
            <option value="invite-only">Invite only</option>
          </select>
        </div>
        <div>
          <label htmlFor="status" className="block text-sm font-medium">Status</label>
          <select id="status" name="status" defaultValue={tool?.status ?? "draft"}
            className={FIELD} style={FIELD_STYLE}
            aria-invalid={e.status ? true : undefined}>
            <option value="draft">Draft — private, not on the site</option>
            {canPublish && (
              <>
                <option value="published">Published — in the catalog</option>
                <option value="planned">Planned — shown, not clickable</option>
                <option value="unlisted">Unlisted — direct link only</option>
                <option value="archived">Archived — hidden everywhere</option>
              </>
            )}
          </select>
          {!canPublish && (
            <p className="mt-1 text-xs" style={{ color: "var(--faint)" }}>Editors save drafts; an admin publishes.</p>
          )}
        </div>
      </div>

      <Field label="Sort order" name="sortOrder" type="number"
        defaultValue={String(tool?.sortOrder ?? 0)} error={e.sortOrder}
        hint="Lower sorts first." />

      <div className="flex items-center gap-3 border-t pt-6" style={{ borderColor: "var(--line)" }}>
        <button type="submit" disabled={pending}
          className="rounded-md px-5 text-sm font-medium disabled:opacity-50"
          style={{ minHeight: 44, background: "var(--foreground)", color: "var(--background)" }}>
          {pending ? "Saving…" : "Save"}
        </button>
        <Link href="/admin" className="text-sm underline underline-offset-4"
          style={{ color: "var(--muted)" }}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
