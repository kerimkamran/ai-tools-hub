import { requirePermission } from "@/lib/auth";
import { getSecurityPolicy, POLICY_BOUNDS, staffDomainsLabel } from "@/lib/security-policy";
import { hasMailConfig } from "@/lib/mailer";
import { PolicyForm } from "./PolicyForm";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  await requirePermission("security.manage");
  const policy = await getSecurityPolicy();
  return (
    <main className="mx-auto max-w-[640px] px-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Security policy</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        Applies to both sign-in paths (/admin and the assistant). Every value has a safe range
        enforced by the database as well as this form.
      </p>
      <PolicyForm policy={policy} bounds={POLICY_BOUNDS} />
      <section className="mt-10 rounded-lg border p-4 text-sm" style={{ borderColor: "var(--line)" }}>
        <p className="font-medium">Staff domains: {staffDomainsLabel()}</p>
        <p className="mt-1 text-xs" style={{ color: "var(--faint)" }}>
          Fixed by a database constraint — shown here, not editable.
        </p>
      </section>
      <section className="mt-4 rounded-lg border p-4 text-sm" style={{ borderColor: "var(--line)" }}>
        <p className="font-medium">
          Self-service email sign-in: {hasMailConfig() ? "Configured" : "Not configured"}
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--faint)" }}>
          {hasMailConfig()
            ? "Staff at the domains above can request a sign-in link at /assistant/login without an admin invite."
            : "Set RESEND_API_KEY (and optionally MAIL_FROM) in the environment to let staff request their own sign-in link by email. Until then, invite staff from Team as usual."}
        </p>
      </section>
    </main>
  );
}
