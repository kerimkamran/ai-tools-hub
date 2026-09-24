import QRCode from "qrcode";
import { requirePermission, needsMfa } from "@/lib/auth";
import { queryOne } from "@/lib/db/client";
import { openSecret } from "@/lib/secret-box";
import { otpauthUri } from "@/lib/totp";
import { mfaRequiredFor } from "@/lib/roles";
import { MfaPanel } from "./MfaForms";

export const dynamic = "force-dynamic";

/**
 * Your own two-step verification. Reachable WITHOUT an MFA session on
 * purpose -- this is where a super admin (always required) or an admin
 * (when the policy requires it) satisfies the requirement. Everything else
 * in /admin redirects here until they do.
 */
export default async function MfaPage() {
  const user = await requirePermission("self.manage", { allowWithoutMfa: true });
  const required = mfaRequiredFor(user.role, user.session.policy.mfaRequiredAdmins);
  const row = await queryOne<{ secret: string | null; enabled: boolean; codes_left: number }>(
    `select totp_secret_encrypted as secret, totp_enabled_at is not null as enabled,
            coalesce(array_length(recovery_codes_hash, 1), 0) as codes_left
       from admin_credentials where email = $1`,
    [user.email]
  );
  const enabled = Boolean(row?.enabled);
  const pendingSecret = !enabled ? openSecret(row?.secret) : null;
  const uri = pendingSecret ? otpauthUri(pendingSecret, user.email) : null;
  const qr = uri ? await QRCode.toDataURL(uri, { margin: 1, width: 200 }) : null;

  return (
    <main className="mx-auto max-w-[560px] px-4 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Two-step verification</h1>
      {needsMfa(user) && (
        <p role="status" className="mt-3 rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: "var(--warning)", color: "var(--foreground)" }}>
          Your role requires two-step verification. Set it up to continue to the admin panel.
        </p>
      )}
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        Uses an authenticator app (Microsoft Authenticator, Google Authenticator, 1Password…).
        {required ? " Required for your role." : " Optional for your role."}
      </p>

      <MfaPanel
        enabled={enabled}
        canDisable={!required}
        codesLeft={row?.codes_left ?? 0}
        qr={qr}
        manualKey={pendingSecret ? pendingSecret.replace(/(.{4})/g, "$1 ").trim() : null}
      />
    </main>
  );
}
