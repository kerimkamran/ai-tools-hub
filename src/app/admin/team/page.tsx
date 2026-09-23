import { requireSuperAdmin, listSuperAdminEmails } from "@/lib/auth";
import { query } from "@/lib/db/client";
import { InviteForm } from "./InviteForm";
import { RemoveButton } from "./RemoveButton";

export const dynamic = "force-dynamic";

type AdminRow = { email: string; invited_by: string; created_at: string };

async function listInvitedAdmins(): Promise<AdminRow[]> {
  return query<AdminRow>(
    "select email, invited_by, created_at from admin_users order by created_at asc"
  );
}

export default async function TeamPage() {
  await requireSuperAdmin();

  const [superAdmins, invited] = await Promise.all([
    Promise.resolve(listSuperAdminEmails()),
    listInvitedAdmins(),
  ]);

  return (
    <main className="mx-auto max-w-[720px] px-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Team</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        Invite an admin to manage the catalog. They can sign in and edit tools, but
        cannot invite others or change the theme — only super admins can.
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--faint)" }}>
          Invite an admin
        </h2>
        <div className="mt-3">
          <InviteForm />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--faint)" }}>
          Invited admins
        </h2>
        <ul className="mt-3 list-none space-y-2 p-0">
          {invited.map((a) => (
            <li
              key={a.email}
              className="flex items-center justify-between gap-4 rounded-lg border p-3"
              style={{ borderColor: "var(--line)" }}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{a.email}</p>
                <p className="truncate text-xs" style={{ color: "var(--faint)" }}>
                  invited by {a.invited_by} · {new Date(a.created_at).toLocaleDateString()}
                </p>
              </div>
              <RemoveButton email={a.email} />
            </li>
          ))}
        </ul>
        {invited.length === 0 && (
          <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
            No invited admins yet.
          </p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--faint)" }}>
          Super admins
        </h2>
        <p className="mt-1 text-xs" style={{ color: "var(--faint)" }}>
          Set via the SUPER_ADMIN_EMAILS environment variable, not here — a super
          admin defined outside the database cannot be removed by anyone who
          compromises the database.
        </p>
        <ul className="mt-3 list-none space-y-2 p-0">
          {superAdmins.map((email) => (
            <li
              key={email}
              className="rounded-lg border p-3 text-sm"
              style={{ borderColor: "var(--line)" }}
            >
              {email}
            </li>
          ))}
        </ul>
        {superAdmins.length === 0 && (
          <p className="mt-3 text-sm" style={{ color: "var(--critical)" }}>
            SUPER_ADMIN_EMAILS is not set. Nobody can manage roles or theme until it is.
          </p>
        )}
      </section>
    </main>
  );
}
