"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { saveTool, type ActionState } from "../actions";
import type { Tool } from "@/lib/types";

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

type Lang = "en" | "az" | "ru";
const LANGS: Array<{ id: Lang; label: string; name: string }> = [
  { id: "en", label: "EN", name: "English" },
  { id: "az", label: "AZ", name: "Azərbaycanca" },
  { id: "ru", label: "RU", name: "Русский" },
];

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
 * EN / AZ / RU tabs over the four translatable fields (Phase C). English is
 * the base value and is required; AZ and RU are optional and fall back to
 * English on the public site. Every panel stays in the DOM (only `hidden`
 * toggles), so all three languages submit together in one save.
 */
function TranslatableFields({ tool, e }: { tool: Tool | null; e: Record<string, string> }) {
  const [lang, setLang] = useState<Lang>("en");
  const tr = (loc: "az" | "ru", key: "name" | "tagline" | "description" | "accessNote") =>
    tool?.i18n?.[loc]?.[key] ?? "";
  const hasError = (loc: Lang) =>
    loc === "en"
      ? Boolean(e.name || e.tagline || e.description || e.accessNote)
      : Object.keys(e).some((k) => k.endsWith(`_${loc}`));

  return (
    <div className="rounded-lg border p-4" style={{ borderColor: "var(--line)" }}>
      <div role="tablist" aria-label="Language" className="flex gap-1">
        {LANGS.map((l) => (
          <button
            key={l.id}
            type="button"
            role="tab"
            id={`tab-${l.id}`}
            aria-selected={lang === l.id}
            aria-controls={`panel-${l.id}`}
            onClick={() => setLang(l.id)}
            className="rounded-md border px-3 text-sm font-medium"
            style={{
              minHeight: 36,
              borderColor: lang === l.id ? "var(--foreground)" : "var(--control-border)",
              background: lang === l.id ? "var(--foreground)" : "transparent",
              color: lang === l.id ? "var(--background)" : "var(--muted)",
            }}
          >
            {l.label}
            {hasError(l.id) && <span style={{ color: "var(--critical)" }}> •</span>}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="panel-en" aria-labelledby="tab-en" hidden={lang !== "en"} className="mt-4 space-y-5">
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

      {(["az", "ru"] as const).map((loc) => {
        const name = LANGS.find((l) => l.id === loc)!.name;
        return (
          <div key={loc} role="tabpanel" id={`panel-${loc}`} aria-labelledby={`tab-${loc}`}
            hidden={lang !== loc} className="mt-4 space-y-5" lang={loc}>
            <p className="text-xs" style={{ color: "var(--faint)" }}>
              {name}. Optional — any field left blank shows the English value instead.
            </p>
            <Field label={`Name (${loc.toUpperCase()})`} name={`name_${loc}`}
              defaultValue={tr(loc, "name")} error={e[`name_${loc}`]} maxLength={60}
              placeholder={tool?.name} hint="Usually the same as English — product names are rarely translated." />
            <Field label={`Tagline (${loc.toUpperCase()})`} name={`tagline_${loc}`}
              defaultValue={tr(loc, "tagline")} error={e[`tagline_${loc}`]} maxLength={80}
              placeholder={tool?.tagline} />
            <TextArea label={`Description (${loc.toUpperCase()})`} name={`description_${loc}`}
              defaultValue={tr(loc, "description")} error={e[`description_${loc}`]} />
            <Field label={`Access note (${loc.toUpperCase()})`} name={`accessNote_${loc}`}
              defaultValue={tr(loc, "accessNote")} error={e[`accessNote_${loc}`]} maxLength={120}
              placeholder={tool?.accessNote ?? ""} />
          </div>
        );
      })}
    </div>
  );
}

export function ToolForm({ tool }: { tool: Tool | null }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveTool, {});
  const e = state.fieldErrors ?? {};

  return (
    <form action={action} className="mt-8 space-y-5">
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

      <TranslatableFields tool={tool} e={e} />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Category" name="category" required defaultValue={tool?.category}
          error={e.category} hint="English name; drives the filter chips. Translate it under Categories." />
        <Field label="Icon" name="icon" defaultValue={tool?.icon}
          hint="An emoji or single character." />
      </div>

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
          <select id="status" name="status" defaultValue={tool?.status ?? "planned"}
            className={FIELD} style={FIELD_STYLE}
            aria-invalid={e.status ? true : undefined}>
            <option value="published">Published — in the catalog</option>
            <option value="planned">Planned — shown, not clickable</option>
            <option value="unlisted">Unlisted — direct link only</option>
            <option value="archived">Archived — hidden everywhere</option>
          </select>
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
