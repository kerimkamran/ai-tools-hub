import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MFA_PENDING_COOKIE, verifyPendingMfaToken } from "@/lib/session";
import { verifyMfa } from "../actions";

export const dynamic = "force-dynamic";

const SHELL = "mx-auto flex min-h-screen max-w-[360px] flex-col justify-center px-4";

export default async function MfaStepPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const jar = await cookies();
  const pending = await verifyPendingMfaToken(jar.get(MFA_PENDING_COOKIE)?.value);
  if (!pending) redirect("/admin/login?error=expired");

  return (
    <main className={SHELL}>
      <h1 className="text-xl font-semibold tracking-tight">Two-step verification</h1>
      <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
        Enter the 6-digit code from your authenticator app for {pending.email}, or one of
        your recovery codes.
      </p>
      <form action={verifyMfa} className="mt-8 space-y-3">
        <div>
          <label htmlFor="code" className="block text-sm" style={{ color: "var(--muted)" }}>
            Code
          </label>
          <input
            id="code" name="code" required autoFocus autoComplete="one-time-code"
            inputMode="text" maxLength={20}
            className="mt-1 w-full rounded-md border px-3 py-2 text-lg tracking-widest outline-none"
            style={{ borderColor: "var(--control-border)", background: "var(--surface)" }}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>
            That code did not work. Try the newest code, or a recovery code.
          </p>
        )}
        <button type="submit" className="w-full rounded-md px-4 text-sm font-medium"
          style={{ minHeight: 44, background: "var(--foreground)", color: "var(--background)" }}>
          Verify
        </button>
      </form>
    </main>
  );
}
