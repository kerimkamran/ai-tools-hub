import { login, logout } from "./actions";
import { hasAuthConfig, isSignedInButNotAdmin } from "@/lib/auth";

const SHELL = "mx-auto flex min-h-screen max-w-[360px] flex-col justify-center px-4";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; invited?: string }>;
}) {
  const { error, invited } = await searchParams;

  // An unconfigured deployment says so plainly rather than offering a form
  // that cannot work. It says nothing about WHY -- no env var names, no stack
  // traces -- because this page is reachable by anyone.
  if (!hasAuthConfig()) {
    return (
      <main className={SHELL}>
        <h1 className="text-xl font-semibold tracking-tight">Admin</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          Not available on this deployment.
        </p>
      </main>
    );
  }

  // Signed in, but not on the allowlist. Without this branch the proxy would
  // send them to /admin and requireAdmin() would send them back here, forever.
  if (await isSignedInButNotAdmin()) {
    return (
      <main className={SHELL}>
        <h1 className="text-xl font-semibold tracking-tight">No access</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          You are signed in, but this account does not have admin access.
        </p>
        <form action={logout} className="mt-6">
          <button
            type="submit"
            className="w-full rounded-md border px-4 text-sm"
            style={{ minHeight: 44, borderColor: "var(--control-border)", color: "var(--foreground)" }}
          >
            Sign out
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className={SHELL}>
      <h1 className="text-xl font-semibold tracking-tight">Admin</h1>
      <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
        Sign in to manage the catalog.
      </p>

      <form action={login} className="mt-8 space-y-3">
        <div>
          <label htmlFor="email" className="block text-sm" style={{ color: "var(--muted)" }}>
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="username"
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none"
            style={{ borderColor: "var(--control-border)", background: "var(--surface)" }}
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm" style={{ color: "var(--muted)" }}>
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none"
            style={{ borderColor: "var(--control-border)", background: "var(--surface)" }}
          />
        </div>

        {invited === "1" && !error && (
          <p className="text-sm" style={{ color: "var(--good)" }}>
            Password set. Sign in below.
          </p>
        )}
        {error === "expired" && (
          <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>
            That sign-in attempt expired. Please start again.
          </p>
        )}
        {error === "locked" && (
          <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>
            Too many failed attempts. Try again in a few minutes.
          </p>
        )}
        {error && error !== "locked" && error !== "expired" && (
          <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>
            {/* Deliberately generic: distinguishing "no such user" from "wrong
                password" hands an attacker an account-enumeration oracle. */}
            Sign-in failed. Check the email and password.
          </p>
        )}

        <button
          type="submit"
          className="w-full rounded-md px-4 text-sm font-medium"
          style={{ minHeight: 44, background: "var(--foreground)", color: "var(--background)" }}
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
