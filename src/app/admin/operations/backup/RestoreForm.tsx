"use client";

import { useRef, useState, useTransition } from "react";
import { applyRestore, previewRestore, type OpsState } from "../actions";

/**
 * Restore in two steps: a dry run (validation + what would change), then the
 * real thing with typed confirmation. The same file is sent both times; the
 * server re-validates it and checks it is unchanged since the dry run.
 */
export function RestoreForm() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<OpsState>({});
  const [result, setResult] = useState<OpsState>({});
  const [confirm, setConfirm] = useState("");
  const [pending, start] = useTransition();

  const fd = () => {
    const f = new FormData();
    const file = fileRef.current?.files?.[0];
    if (file) f.set("file", file);
    return f;
  };

  return (
    <section className="mt-10 rounded-lg border p-4" style={{ borderColor: "var(--line)" }}>
      <h2 className="text-base font-semibold">Restore from a backup</h2>
      <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
        Replaces ALL content listed above with the file&apos;s. The current state is exported automatically first.
      </p>
      <input ref={fileRef} type="file" accept="application/json,.json" className="mt-3 block text-sm"
        onChange={() => { setPreview({}); setResult({}); setConfirm(""); }} aria-label="Backup file" />
      <button type="button" disabled={pending} onClick={() => start(async () => { setResult({}); setPreview(await previewRestore({}, fd())); })}
        className="mt-3 rounded-md border px-4 text-sm disabled:opacity-50" style={{ minHeight: 44, borderColor: "var(--control-border)" }}>
        {pending && !preview.diff ? "Checking…" : "Dry run"}
      </button>

      {preview.error && <p role="alert" className="mt-3 text-sm" style={{ color: "var(--critical)" }}>{preview.error}</p>}
      {preview.errors && <ul className="mt-1 list-disc pl-5 text-xs" style={{ color: "var(--critical)" }}>{preview.errors.map((e) => <li key={e}>{e}</li>)}</ul>}

      {preview.diff && (
        <div className="mt-4">
          <p className="text-sm" style={{ color: "var(--muted)" }}>{preview.ok} File check: {preview.fingerprint}</p>
          <table className="mt-2 w-full text-sm">
            <thead><tr className="text-left text-xs" style={{ color: "var(--faint)" }}><th className="py-1">Content</th><th>Added</th><th>Changed</th><th>Removed</th><th>Unchanged</th></tr></thead>
            <tbody>
              {preview.diff.map((d) => (
                <tr key={d.table} className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td className="py-1">{d.label}</td>
                  <td title={d.added.join(", ")} style={{ color: d.added.length ? "var(--good)" : undefined }}>{d.added.length}</td>
                  <td title={d.changed.join(", ")} style={{ color: d.changed.length ? "var(--warning)" : undefined }}>{d.changed.length}</td>
                  <td title={d.removed.join(", ")} style={{ color: d.removed.length ? "var(--critical)" : undefined }}>{d.removed.length}</td>
                  <td>{d.unchanged}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <label className="mt-4 block text-sm">Type <strong>restore</strong> to replace the content
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off"
              className="mt-1 block rounded-md border px-3 text-sm" style={{ minHeight: 44, borderColor: "var(--control-border)", background: "var(--surface)" }} />
          </label>
          <button type="button" disabled={pending || confirm.trim().toLowerCase() !== "restore"}
            onClick={() => start(async () => {
              const f = fd();
              f.set("confirm", confirm);
              f.set("fingerprint", preview.fingerprint ?? "");
              const r = await applyRestore({}, f);
              setResult(r);
              if (!r.error) setPreview({});
            })}
            className="mt-3 rounded-md px-5 text-sm font-medium disabled:opacity-40" style={{ minHeight: 44, background: "var(--critical)", color: "#fff" }}>
            {pending ? "Restoring…" : "Restore"}
          </button>
        </div>
      )}
      {result.error && <p role="alert" className="mt-3 text-sm" style={{ color: "var(--critical)" }}>{result.error}</p>}
      {result.errors && <ul className="mt-1 list-disc pl-5 text-xs" style={{ color: "var(--critical)" }}>{result.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      {result.ok && <p role="status" className="mt-3 text-sm" style={{ color: "var(--good)" }}>{result.ok}</p>}
    </section>
  );
}
