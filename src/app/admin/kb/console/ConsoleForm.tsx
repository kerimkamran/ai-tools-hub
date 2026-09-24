"use client";

import { useKeepAction } from "@/components/admin/useKeepAction";
import { askConsole, type ConsoleState } from "./actions";

export function ConsoleForm() {
  const [state, onSubmit, pending] = useKeepAction<ConsoleState>(askConsole, {});
  return (
    <>
      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <label htmlFor="question" className="block text-sm font-medium">Question</label>
        <textarea
          id="question"
          name="question"
          rows={3}
          maxLength={2000}
          required
          placeholder="e.g. Which tool helps me write a job description?"
          className="w-full rounded-md border px-3 py-2 text-sm outline-none"
          style={{ borderColor: "var(--control-border)", background: "var(--surface)", color: "var(--foreground)" }}
        />
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2" style={{ minHeight: 44 }}>
            <input type="checkbox" name="drafts" defaultChecked /> Include draft articles
          </label>
          <label className="flex items-center gap-2" style={{ minHeight: 44 }}>
            Interface language
            <select name="locale" className="rounded-md border px-2" style={{ minHeight: 36, borderColor: "var(--control-border)", background: "var(--surface)" }}>
              <option value="en">English</option>
              <option value="az">Azərbaycanca</option>
              <option value="ru">Русский</option>
            </select>
          </label>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md px-5 text-sm font-medium disabled:opacity-50"
          style={{ minHeight: 44, background: "var(--foreground)", color: "var(--background)" }}
        >
          {pending ? "Asking…" : "Ask"}
        </button>
      </form>
      {state.error && <p role="alert" className="mt-4 text-sm" style={{ color: "var(--critical)" }}>{state.error}</p>}
      {state.answer && !pending && (
        <section aria-live="polite" className="mt-6 rounded-lg border p-4" style={{ borderColor: "var(--line)" }}>
          <p className="text-xs" style={{ color: "var(--faint)" }}>
            Answer {state.usedDrafts ? "with drafts included" : "from published articles only"}
            {typeof state.costUsd === "number" ? ` · $${state.costUsd.toFixed(4)}` : ""}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm">{state.answer}</p>
        </section>
      )}
    </>
  );
}
