"use client";

import { useKeepAction } from "@/components/admin/useKeepAction";
import { CopyLink } from "@/components/admin/CopyLink";
import { addAccount, bulkAddStaff, type AccountState } from "../actions";

const FIELD = "mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none";
const FIELD_STYLE = { borderColor: "var(--control-border)", background: "var(--surface)", color: "var(--foreground)" };

export function AddForms({ superView }: { superView: boolean }) {
  const [one, addOne, pendingOne] = useKeepAction<AccountState>(addAccount, {});
  const [bulk, addBulk, pendingBulk] = useKeepAction<AccountState>(bulkAddStaff, {});

  return (
    <div className="mt-8 space-y-10">
      <form onSubmit={addOne} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium">Email</label>
          <input id="email" name="email" type="email" required className={FIELD} style={FIELD_STYLE} />
        </div>
        <div>
          <label htmlFor="displayName" className="block text-sm font-medium">Display name (optional)</label>
          <input id="displayName" name="displayName" maxLength={80} className={FIELD} style={FIELD_STYLE} />
        </div>
        <div>
          <label htmlFor="role" className="block text-sm font-medium">Role</label>
          <select id="role" name="role" defaultValue="staff" className={FIELD} style={FIELD_STYLE}>
            <option value="staff">Staff — assistant only (@azerconnect.az)</option>
            {superView && <option value="editor">Editor — drafts only</option>}
            {superView && <option value="admin">Admin — content and day-to-day operations</option>}
          </select>
          <p className="mt-1 text-xs" style={{ color: "var(--faint)" }}>
            Super admins are set only through the SUPER_ADMIN_EMAILS setting, never here.
          </p>
        </div>
        {one.error && <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>{one.error}</p>}
        {one.ok && <p role="status" className="text-sm" style={{ color: "var(--good)" }}>{one.ok}</p>}
        {one.link && <CopyLink url={one.link} />}
        <button type="submit" disabled={pendingOne}
          className="rounded-md px-5 text-sm font-medium disabled:opacity-50"
          style={{ minHeight: 44, background: "var(--foreground)", color: "var(--background)" }}>
          {pendingOne ? "Creating…" : "Save"}
        </button>
      </form>

      <details className="rounded-lg border p-4" style={{ borderColor: "var(--line)" }}>
        <summary className="cursor-pointer text-sm font-medium">Bulk add staff</summary>
        <form onSubmit={addBulk} className="mt-4 space-y-3">
          <label htmlFor="emails" className="block text-sm" style={{ color: "var(--muted)" }}>
            Paste @azerconnect.az addresses — one per line, or separated by commas.
          </label>
          <textarea id="emails" name="emails" rows={6} className={FIELD} style={FIELD_STYLE} />
          {bulk.error && <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>{bulk.error}</p>}
          {bulk.ok && <p role="status" className="text-sm" style={{ color: "var(--good)" }}>{bulk.ok}</p>}
          {bulk.links && bulk.links.length > 0 && (
            <ul className="list-none space-y-2 p-0">
              {bulk.links.map((l) => (
                <li key={l.email}>
                  <CopyLink url={l.link} note={`Setup link for ${l.email} (one use, 7 days).`} />
                </li>
              ))}
            </ul>
          )}
          <button type="submit" disabled={pendingBulk}
            className="rounded-md border px-5 text-sm font-medium disabled:opacity-50"
            style={{ minHeight: 44, borderColor: "var(--control-border)" }}>
            {pendingBulk ? "Adding…" : "Add all"}
          </button>
        </form>
      </details>
    </div>
  );
}
