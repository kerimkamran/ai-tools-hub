import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { ConsoleForm } from "./ConsoleForm";

export const dynamic = "force-dynamic";

export default async function KbConsolePage() {
  await requirePermission("kb.draft");
  return (
    <main className="mx-auto max-w-[720px] px-4 py-10">
      <Link href="/admin/kb" className="text-sm underline underline-offset-4" style={{ color: "var(--muted)" }}>
        ← Knowledge base
      </Link>
      <h1 className="mt-4 text-xl font-semibold tracking-tight">Test the assistant</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        Ask what staff would ask and see how the assistant answers — with your draft articles included, before
        anything is published. Nothing is stored; each question counts against the monthly AI budget.
      </p>
      <ConsoleForm />
    </main>
  );
}
