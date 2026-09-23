import Link from "next/link";
import { getAdminContext } from "@/lib/auth";
import { logout } from "./login/actions";

/**
 * Shared chrome for the three admin sections (Catalog, Theme, Team).
 * Presentational only -- rendering here is NOT the security boundary. Theme
 * and Team links are hidden from an ordinary admin, but each of those pages
 * calls requireSuperAdmin() itself regardless, exactly like every other
 * admin page/Server Action re-checks itself rather than trusting the nav
 * (or the proxy) to have already gated the request.
 *
 * Renders nothing when there is no admin context -- which is also what
 * keeps it off /admin/login for a signed-out visitor or a signed-in
 * non-admin, without a special case for that route here.
 */
export async function AdminNav() {
  const ctx = await getAdminContext();
  if (!ctx) return null;

  return (
    <nav
      className="border-b"
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
    >
      <div className="mx-auto flex max-w-[900px] flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-1 text-sm">
          <Link href="/admin" className="rounded px-2 py-1 hover:opacity-70">
            Catalog
          </Link>
          {ctx.isSuperAdmin && (
            <>
              <Link href="/admin/theme" className="rounded px-2 py-1 hover:opacity-70">
                Theme
              </Link>
              <Link href="/admin/team" className="rounded px-2 py-1 hover:opacity-70">
                Team
              </Link>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs" style={{ color: "var(--faint)" }}>
          <span className="truncate">
            {ctx.user.email}
            {ctx.isSuperAdmin ? " · Super admin" : ""}
          </span>
          <form action={logout}>
            <button
              type="submit"
              className="rounded border px-3 py-1.5 text-xs"
              style={{ borderColor: "var(--control-border)", color: "var(--muted)" }}
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </nav>
  );
}
