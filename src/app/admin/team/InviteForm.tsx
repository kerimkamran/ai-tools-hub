"use client";

import { useActionState, useState } from "react";
import { inviteAdmin, inviteStaff, type InviteState } from "./actions";

export function InviteForm({ kind = "admin" }: { kind?: "admin" | "staff" }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(
    kind === "staff" ? inviteStaff : inviteAdmin,
    {}
  );
  const inputId = `invite-email-${kind}`;
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    if (!state.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(state.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can throw (insecure context, denied permission) --
      // the link is still selectable text in the input below either way.
    }
  }

  return (
    <div>
      <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="flex-1">
          <label htmlFor={inputId} className="sr-only">
            Email to invite
          </label>
          <input
            id={inputId}
            name="email"
            type="email"
            required
            placeholder={kind === "staff" ? "name@azerconnect.az" : "name@company.com"}
            className="w-full rounded-md border px-3 py-2 text-sm outline-none"
            style={{ borderColor: "var(--control-border)", background: "var(--surface)" }}
          />
          {state.error && (
            <p role="alert" className="mt-1 text-xs" style={{ color: "var(--critical)" }}>
              {state.error}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
          style={{ background: "var(--foreground)", color: "var(--background)", minHeight: 38 }}
        >
          {pending ? "Creating…" : "Invite"}
        </button>
      </form>

      {state.ok && !state.inviteUrl && (
        <p role="status" className="mt-3 text-sm" style={{ color: "var(--good)" }}>
          Access granted. They already have a password, so no link is needed.
        </p>
      )}

      {state.ok && state.inviteUrl && (
        <div
          className="mt-3 rounded-md border p-3"
          style={{ borderColor: "var(--control-border)", background: "var(--surface)" }}
        >
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Share this link with them yourself — it isn&apos;t emailed. It works once and
            expires in 7 days.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              readOnly
              value={state.inviteUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full rounded-md border px-3 py-2 text-xs outline-none"
              style={{ borderColor: "var(--control-border)", background: "var(--background)" }}
            />
            <button
              type="button"
              onClick={copyLink}
              className="shrink-0 rounded-md border px-3 py-2 text-xs"
              style={{ borderColor: "var(--control-border)" }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
