import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { AddForms } from "./AddForms";

export const dynamic = "force-dynamic";

export default async function NewAccountPage() {
  const user = await requirePermission("accounts.staff");
  return (
    <main className="mx-auto max-w-[560px] px-4 py-10">
      <Link href="/admin/accounts" className="text-sm underline underline-offset-4" style={{ color: "var(--muted)" }}>
        ← Accounts
      </Link>
      <h1 className="mt-4 text-xl font-semibold tracking-tight">Add account</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        Saving creates the account and a one-time setup link. Copy it and send it to them — Render
        cannot send email. They choose their own password.
      </p>
      <AddForms superView={can(user.role, "accounts.manage")} />
    </main>
  );
}
