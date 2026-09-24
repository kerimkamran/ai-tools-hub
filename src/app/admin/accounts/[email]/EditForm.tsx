"use client";

import { useKeepAction } from "@/components/admin/useKeepAction";
import Link from "next/link";
import { updateAccount, type AccountState } from "../actions";

const FIELD = "mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none";
const FIELD_STYLE = { borderColor: "var(--control-border)", background: "var(--surface)", color: "var(--foreground)" };

export function EditForm(p: {
  email: string;
  displayName: string;
  role: "super" | "admin" | "editor" | "staff" | null;
  disabled: boolean;
  canChangeRole: boolean;
  canDisable: boolean;
}) {
  const [state, action, pending] = useKeepAction<AccountState>(updateAccount, {});
  return (
    <form onSubmit={action} className="mt-8 space-y-5">
      <input type="hidden" name="email" value={p.email} />
      <div>
        <label htmlFor="displayName" className="block text-sm font-medium">Display name</label>
        <input id="displayName" name="displayName" maxLength={80} defaultValue={p.displayName}
          className={FIELD} style={FIELD_STYLE} />
      </div>
      <div>
        <label htmlFor="role" className="block text-sm font-medium">Role</label>
        {p.canChangeRole ? (
          <select id="role" name="role" defaultValue={p.role ?? "staff"} className={FIELD} style={FIELD_STYLE}>
            <option value="admin">Admin</option>
            <option value="editor">Editor</option>
            <option value="staff">Staff</option>
          </select>
        ) : (
          <p id="role" className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            {p.role === "super" ? "Super admin — set by configuration, not editable here." : p.role ?? "No role"}
            {p.role !== "super" ? " (only a super admin can change roles, and never their own)" : ""}
          </p>
        )}
      </div>
      <div>
        <label htmlFor="status" className="block text-sm font-medium">Status</label>
        {p.canDisable ? (
          <select id="status" name="status" defaultValue={p.disabled ? "disabled" : "active"} className={FIELD} style={FIELD_STYLE}>
            <option value="active">Active</option>
            <option value="disabled">Disabled — cannot sign in; all sessions end</option>
          </select>
        ) : (
          <>
            <input type="hidden" name="status" value={p.disabled ? "disabled" : "active"} />
            <p id="status" className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
              {p.disabled ? "Disabled" : "Active"}
            </p>
          </>
        )}
      </div>
      {state.error && <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>{state.error}</p>}
      {state.ok && <p role="status" className="text-sm" style={{ color: "var(--good)" }}>{state.ok}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending}
          className="rounded-md px-5 text-sm font-medium disabled:opacity-50"
          style={{ minHeight: 44, background: "var(--foreground)", color: "var(--background)" }}>
          {pending ? "Saving…" : "Save"}
        </button>
        <Link href="/admin/accounts" className="text-sm underline underline-offset-4" style={{ color: "var(--muted)" }}>
          Back
        </Link>
      </div>
    </form>
  );
}
