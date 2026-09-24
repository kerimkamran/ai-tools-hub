import { requireAdmin, isSuperAdminEmail } from "@/lib/auth";
import { PasswordForm } from "./PasswordForm";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireAdmin();
  return (
    <main className="mx-auto max-w-[420px] px-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Your account</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        Signed in as {user.email}
        {isSuperAdminEmail(user.email) ? " (super admin)" : ""}.
      </p>
      <PasswordForm />
    </main>
  );
}
