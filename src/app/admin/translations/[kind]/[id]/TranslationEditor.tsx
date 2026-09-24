"use client";

import { useActionState, useTransition } from "react";
import { useKeepAction } from "@/components/admin/useKeepAction";
import type { FieldStatus } from "@/lib/translation-status";
import { draftWithAi, saveTranslation, type TranslationState } from "../../actions";

type Field = { key: string; label: string; multiline?: boolean; max: number; optional?: boolean };

// Same labels as translation-status.ts (which uses node:crypto, so it
// cannot be bundled for the browser).
const STATUS_LABEL: Record<FieldStatus, string> = {
  ok: "Up to date",
  missing: "Missing",
  stale: "Needs update",
  review: "Needs review",
  na: "—",
};
const COLOR: Record<FieldStatus, string> = {
  ok: "var(--good)",
  missing: "var(--critical)",
  stale: "var(--warning)",
  review: "var(--warning)",
  na: "var(--faint)",
};
const INPUT = "mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none";
const INPUT_STYLE = { borderColor: "var(--control-border)", background: "var(--surface)", color: "var(--foreground)" };

type Props = {
  kind: string;
  id: string;
  fields: Field[];
  english: Record<string, string>;
  values: Partial<Record<"az" | "ru", Record<string, string | undefined>>>;
  statuses: Record<"az" | "ru", Record<string, FieldStatus>>;
  canEdit: boolean;
};

/**
 * The action state lives here, OUTSIDE the keyed form: the form remounts
 * with fresh values after a save or an AI draft (its inputs are
 * uncontrolled), and the status message must survive that.
 */
export function TranslationEditor(props: Props & { version: string }) {
  const [state, onSubmit, pending] = useKeepAction<TranslationState>(saveTranslation, {});
  const [aiState, aiDispatch] = useActionState<TranslationState, FormData>(draftWithAi, {});
  const [aiPending, startAi] = useTransition();
  return (
    <>
      <EditorForm
        key={props.version}
        {...props}
        onSubmit={onSubmit}
        pending={pending}
        state={state}
        aiPending={aiPending}
        onDraft={() => {
          const fd = new FormData();
          fd.set("kind", props.kind);
          fd.set("id", props.id);
          startAi(() => aiDispatch(fd));
        }}
      />
      {aiState.error && <p role="alert" className="mt-3 text-sm" style={{ color: "var(--critical)" }}>{aiState.error}</p>}
      {aiState.ok && !aiPending && <p role="status" className="mt-3 text-sm" style={{ color: "var(--good)" }}>{aiState.ok}</p>}
    </>
  );
}

function EditorForm(props: Props & {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  pending: boolean;
  state: TranslationState;
  aiPending: boolean;
  onDraft: () => void;
}) {
  const { onSubmit, pending, state, aiPending } = props;
  const needsWork = (["az", "ru"] as const).some((l) =>
    Object.values(props.statuses[l]).some((s) => s === "missing" || s === "stale")
  );

  return (
      <form onSubmit={onSubmit} className="mt-6 space-y-6">
        <input type="hidden" name="kind" value={props.kind} />
        <input type="hidden" name="id" value={props.id} />
        {props.fields.map((f) => (
          <fieldset key={f.key} className="rounded-lg border p-4" style={{ borderColor: "var(--line)" }}>
            <legend className="px-1 text-sm font-medium">
              {f.label}
              {f.optional && <span className="ml-2 text-xs font-normal" style={{ color: "var(--faint)" }}>optional — often left in English</span>}
            </legend>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-xs font-medium" style={{ color: "var(--faint)" }}>English (source)</p>
                <p lang="en" className="mt-1 whitespace-pre-wrap rounded-md p-3 text-sm" style={{ background: "var(--surface-sunken)", maxHeight: 320, overflow: "auto" }}>
                  {props.english[f.key] || <span style={{ color: "var(--faint)" }}>(empty)</span>}
                </p>
              </div>
              {(["az", "ru"] as const).map((loc) => {
                const s = props.statuses[loc][f.key];
                const name = `${loc}:${f.key}`;
                const common = {
                  id: name,
                  name,
                  lang: loc,
                  defaultValue: props.values[loc]?.[f.key] ?? "",
                  maxLength: f.max,
                  disabled: !props.canEdit,
                  className: INPUT,
                  style: INPUT_STYLE,
                  placeholder: props.english[f.key],
                };
                return (
                  <div key={loc}>
                    <label htmlFor={name} className="flex items-center justify-between text-xs font-medium" style={{ color: "var(--faint)" }}>
                      <span>{loc === "az" ? "Azərbaycanca" : "Русский"}</span>
                      <span style={{ color: COLOR[s] }}>{s === "na" ? "" : STATUS_LABEL[s]}</span>
                    </label>
                    {f.multiline ? <textarea rows={8} {...common} /> : <input {...common} />}
                    {props.canEdit && (s === "stale" || s === "review") && (
                      <label className="mt-1 flex items-center gap-2 text-xs" style={{ minHeight: 32, color: "var(--muted)" }}>
                        <input type="checkbox" name="confirm" value={name} /> Checked — mark as reviewed
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </fieldset>
        ))}

        {state.error && <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>{state.error}</p>}
        {state.ok && !pending && <p role="status" className="text-sm" style={{ color: "var(--good)" }}>{state.ok}</p>}

        {props.canEdit && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md px-5 text-sm font-medium disabled:opacity-50"
              style={{ minHeight: 44, background: "var(--foreground)", color: "var(--background)" }}
            >
              {pending ? "Saving…" : "Save translations"}
            </button>
            {needsWork && (
              <button
                type="button"
                disabled={aiPending}
                onClick={props.onDraft}
                className="rounded-md border px-4 text-sm disabled:opacity-50"
                style={{ minHeight: 44, borderColor: "var(--control-border)", color: "var(--foreground)" }}
              >
                {aiPending ? "Translating…" : "Translate missing & outdated now"}
              </button>
            )}
          </div>
        )}
        {props.canEdit && needsWork && (
          <p className="text-xs" style={{ color: "var(--faint)" }}>
            This normally happens automatically after each English save. It fills only missing and outdated fields and
            saves them right away. Save your own corrections first. Counts against the monthly AI budget.
          </p>
        )}
      </form>
  );
}
