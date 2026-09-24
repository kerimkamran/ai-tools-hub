import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { queryOne } from "@/lib/db/client";
import { ROLE_LABEL } from "@/lib/permissions";
import { NameForm, PasswordForm, SignOutEverywhereForm } from "./PasswordForm";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requirePermission("self.manage");
  const row = await queryOne<{ display_name: string | null; mfa: boolean }>(
    "select display_name, totp_enabled_at is not null as mfa from admin_credentials where email = $1",
    [user.email]
  );
  return (
    <main className="mx-auto max-w-[480px] px-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight">My account</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        {user.email} · {ROLE_LABEL[user.role]}
      </p>

      <section className="mt-8">
        <NameForm current={row?.display_name ?? ""} />
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--faint)" }}>Password</h2>
        <div className="mt-3"><PasswordForm /></div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--faint)" }}>Two-step verification</h2>
        <p className="mt-2 text-sm">
          {row?.mfa ? "On." : "Off."}{" "}
          <Link href="/admin/security/mfa" className="underline underline-offset-4">Manage</Link>
        </p>
      </section>

      <section className="mt-10">
        <details className="rounded-lg border p-4" style={{ borderColor: "var(--line)" }}>
          <summary className="cursor-pointer text-sm font-medium">Sign out everywhere</summary>
          <div className="mt-3"><SignOutEverywhereForm /></div>
        </details>
      </section>
    </main>
  );
}
