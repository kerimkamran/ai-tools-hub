import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listAccounts } from "@/lib/accounts";
import { EditForm } from "./EditForm";

export const dynamic = "force-dynamic";

export default async function EditAccountPage({ params }: { params: Promise<{ email: string }> }) {
  const user = await requirePermission("accounts.staff");
  const email = decodeURIComponent((await params).email).toLowerCase();
  const account = (await listAccounts()).find((a) => a.email === email);
  if (!account) notFound();

  const superView = can(user.role, "accounts.manage");
  // Admins may edit staff accounts only.
  if (!superView && account.role !== "staff") redirect("/admin/accounts");

  const self = email === user.email;
  return (
    <main className="mx-auto max-w-[560px] px-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Edit {email}</h1>
      <EditForm
        email={email}
        displayName={account.displayName ?? ""}
        role={account.role}
        disabled={account.status === "disabled"}
        canChangeRole={superView && !self && !account.envSuper}
        canDisable={!self && !account.envSuper}
      />
    </main>
  );
}
