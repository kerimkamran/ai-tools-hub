"use client";

import { useActionState, useTransition } from "react";
import { ActionMenu, type ActionItem } from "@/components/admin/ActionMenu";
import { CopyLink } from "@/components/admin/CopyLink";
import { accountAction, type AccountState } from "./actions";

export type AccountView = {
  email: string;
  displayName: string | null;
  roleLabel: string;
  status: "active" | "disabled" | "pending" | "locked";
  mfa: boolean;
  lastSignIn: string | null;
  envSuper: boolean;
  isSelf: boolean;
  canEdit: boolean;
  canResetMfa: boolean;
};

const STATUS_STYLE: Record<AccountView["status"], { label: string; color: string }> = {
  active: { label: "Active", color: "var(--good)" },
  pending: { label: "Setup pending", color: "var(--warning)" },
  locked: { label: "Locked", color: "var(--critical)" },
  disabled: { label: "Disabled", color: "var(--faint)" },
};

export function AccountRow({ a }: { a: AccountView }) {
  const [state, dispatch] = useActionState<AccountState, FormData>(accountAction, {});
  const [pending, start] = useTransition();

  const run = (op: string, confirm?: string) => {
    const fd = new FormData();
    fd.set("op", op);
    fd.set("email", a.email);
    if (confirm) fd.set("confirm", confirm);
    start(() => dispatch(fd));
  };

  const items: ActionItem[] = [];
  if (a.canEdit) items.push({ label: "Edit", href: `/admin/accounts/${encodeURIComponent(a.email)}` });
  if (a.canEdit && a.status !== "disabled") {
    items.push({ label: a.status === "pending" ? "New setup link" : "Reset link", onSelect: () => run("reset_link") });
  }
  if (a.canEdit && a.status === "locked") items.push({ label: "Unlock", onSelect: () => run("unlock") });
  if (a.canResetMfa && a.mfa) items.push({ label: "Reset MFA", onSelect: () => run("reset_mfa") });
  if (a.canEdit && a.status !== "pending") {
    items.push({
      label: "Sign out everywhere",
      destructive: true,
      confirm: { prompt: `Type ${a.email} to sign this account out everywhere`, expected: a.email },
      onSelect: (v) => run("sign_out", v),
    });
  }
  if (a.canEdit && !a.isSelf && !a.envSuper) {
    items.push({
      label: "Delete",
      destructive: true,
      confirm: { prompt: `Type ${a.email} to delete this account`, expected: a.email },
      onSelect: (v) => run("delete", v),
    });
  }

  const s = STATUS_STYLE[a.status];
  return (
    <li className="rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {a.displayName ? `${a.displayName} · ` : ""}
            {a.email}
            {a.isSelf ? " (you)" : ""}
          </p>
          <p className="flex flex-wrap items-center gap-x-2 text-xs" style={{ color: "var(--faint)" }}>
            <span>{a.roleLabel}{a.envSuper ? " · set by configuration 🔒" : ""}</span>
            <span aria-hidden="true">·</span>
            <span style={{ color: s.color }}>● {s.label}</span>
            <span aria-hidden="true">·</span>
            <span>MFA {a.mfa ? "on" : "off"}</span>
            <span aria-hidden="true">·</span>
            <span>{a.lastSignIn ? `last sign-in ${a.lastSignIn}` : "never signed in"}</span>
          </p>
        </div>
        {items.length > 0 && <ActionMenu items={items} label={`Actions for ${a.email}`} />}
      </div>
      {pending && <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>Working…</p>}
      {state.error && <p role="alert" className="mt-2 text-xs" style={{ color: "var(--critical)" }}>{state.error}</p>}
      {state.ok && <p role="status" className="mt-2 text-xs" style={{ color: "var(--good)" }}>{state.ok}</p>}
      {state.link && <CopyLink url={state.link} />}
    </li>
  );
}
