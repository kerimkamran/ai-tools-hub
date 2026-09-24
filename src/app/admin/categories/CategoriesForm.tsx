"use client";

import { useActionState } from "react";
import { saveCategories, type CategoriesState } from "./actions";

type Row = { name: string; az: string; ru: string; toolCount: number };

const FIELD = "w-full rounded-md border px-3 py-2 text-sm outline-none";
const FIELD_STYLE = {
  borderColor: "var(--control-border)",
  background: "var(--surface)",
  color: "var(--foreground)",
};

export function CategoriesForm({ rows }: { rows: Row[] }) {
  const [state, action, pending] = useActionState<CategoriesState, FormData>(saveCategories, {});

  return (
    <form action={action} className="mt-8 space-y-4">
      {state.error && (
        <p role="alert" className="rounded-md border px-3 py-2 text-sm"
           style={{ borderColor: "var(--critical)", color: "var(--critical)" }}>
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="rounded-md border px-3 py-2 text-sm"
           style={{ borderColor: "var(--good)", color: "var(--good)" }}>
          Saved. The public site picks up the change within seconds.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left" style={{ color: "var(--faint)" }}>
              <th scope="col" className="py-2 pr-3 font-medium">English (key)</th>
              <th scope="col" className="py-2 pr-3 font-medium">Azərbaycanca</th>
              <th scope="col" className="py-2 font-medium">Русский</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t" style={{ borderColor: "var(--line)" }}>
                <td className="py-2 pr-3 align-middle">
                  <input type="hidden" name="name" value={r.name} />
                  <span className="font-medium">{r.name}</span>
                  <span className="block text-xs" style={{ color: "var(--faint)" }}>
                    {r.toolCount} {r.toolCount === 1 ? "tool" : "tools"}
                  </span>
                </td>
                <td className="py-2 pr-3">
                  <label className="sr-only" htmlFor={`az-${r.name}`}>{r.name} in Azerbaijani</label>
                  <input id={`az-${r.name}`} name={`az:${r.name}`} defaultValue={r.az} maxLength={40}
                    placeholder={r.name} lang="az" className={FIELD} style={FIELD_STYLE} />
                </td>
                <td className="py-2">
                  <label className="sr-only" htmlFor={`ru-${r.name}`}>{r.name} in Russian</label>
                  <input id={`ru-${r.name}`} name={`ru:${r.name}`} defaultValue={r.ru} maxLength={40}
                    placeholder={r.name} lang="ru" className={FIELD} style={FIELD_STYLE} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button type="submit" disabled={pending || rows.length === 0}
        className="rounded-md px-5 text-sm font-medium disabled:opacity-50"
        style={{ minHeight: 44, background: "var(--foreground)", color: "var(--background)" }}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
