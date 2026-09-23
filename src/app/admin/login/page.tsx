import { login } from "./actions";
import { hasSupabaseConfig } from "@/lib/supabase/server";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  // An unconfigured deployment should say so plainly rather than offer a
  // form that cannot work. Says nothing about WHY -- no env var names, no
  // stack traces -- because this page is reachable by anyone.
  if (!hasSupabaseConfig()) {
    return (
      <main className="mx-auto flex min-h-screen max-w-[360px] flex-col justify-center px-4">
        <h1 className="text-xl font-semibold tracking-tight">Admin</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          Not available on this deployment.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-[360px] flex-col justify-center px-4">
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

        {error && (
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
