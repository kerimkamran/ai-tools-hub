import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { can, ROLE_LABEL } from "@/lib/permissions";
import { listAccounts } from "@/lib/accounts";
import { AccountRow, type AccountView } from "./AccountRow";

export const dynamic = "force-dynamic";

function fmt(ts: string | null): string | null {
  if (!ts) return null;
  return new Date(ts).toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

export default async function AccountsPage() {
  const user = await requirePermission("accounts.staff");
  const superView = can(user.role, "accounts.manage");
  const all = await listAccounts();
  // Admins manage staff accounts only, so that is all they are shown.
  const accounts = superView ? all : all.filter((a) => a.role === "staff");

  const views: AccountView[] = accounts.map((a) => ({
    email: a.email,
    displayName: a.displayName,
    roleLabel: a.role ? ROLE_LABEL[a.role] : "No role",
    status: a.status,
    mfa: a.mfa,
    lastSignIn: fmt(a.lastSignInAt),
    envSuper: a.envSuper,
    isSelf: a.email === user.email,
    canEdit: superView || a.role === "staff",
    canResetMfa: superView,
  }));

  return (
    <main className="mx-auto max-w-[1000px] px-4 py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Accounts</h1>
        <Link
          href="/admin/accounts/new"
          className="flex items-center rounded-md px-4 text-sm font-medium"
          style={{ minHeight: 44, background: "var(--foreground)", color: "var(--background)" }}
        >
          Add account
        </Link>
      </div>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        {superView
          ? "Everyone who can sign in: super admins, admins, editors and staff."
          : "Staff accounts (assistant access). Only a super admin can manage admins and editors."}{" "}
        Nobody sets or sees anyone else&apos;s password — people choose their own through a
        one-time link.
      </p>
      <ul className="mt-8 list-none space-y-2 p-0">
        {views.map((v) => (
          <AccountRow key={v.email} a={v} />
        ))}
      </ul>
      {views.length === 0 && (
        <p className="mt-8 text-sm" style={{ color: "var(--muted)" }}>No accounts yet.</p>
      )}
    </main>
  );
}
