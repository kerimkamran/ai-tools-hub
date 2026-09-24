import Link from "next/link";
import { getAdminContext, needsMfa } from "@/lib/auth";
import { can, ROLE_LABEL, type Permission } from "@/lib/permissions";
import { NavGroups, type NavGroup } from "@/components/admin/NavGroups";
import { logout } from "./login/actions";

/**
 * Shared admin chrome. Presentational only -- NOT the security boundary.
 * Items are filtered by the permission map so a role never sees what it
 * cannot use, and every page/action still calls requirePermission().
 */
const GROUPS: Array<{ label: string; items: Array<{ label: string; href: string; perm: Permission }> }> = [
  {
    label: "People & security",
    items: [
      { label: "Accounts", href: "/admin/accounts", perm: "accounts.staff" },
      { label: "Security policy", href: "/admin/security", perm: "security.manage" },
      { label: "Audit log", href: "/admin/audit", perm: "audit.view" },
      { label: "My account", href: "/admin/account", perm: "self.manage" },
    ],
  },
  {
    label: "Content",
    items: [
      { label: "Catalog", href: "/admin", perm: "catalog.view" },
      { label: "Categories", href: "/admin/categories", perm: "categories.manage" },
      { label: "Translations", href: "/admin/translations", perm: "translations.view" },
      { label: "Knowledge base", href: "/admin/kb", perm: "kb.draft" },
      { label: "Test the assistant", href: "/admin/kb/console", perm: "kb.draft" },
    ],
  },
  {
    label: "AI",
    items: [
      { label: "Assistant & spend", href: "/admin/assistant", perm: "ai.manage" },
      { label: "Connections", href: "/admin/ai/connections", perm: "ai.manage" },
      { label: "Insights", href: "/admin/ai/insights", perm: "insights.view" },
    ],
  },
  {
    label: "Brand & operations",
    items: [
      { label: "Design Studio", href: "/admin/theme", perm: "theme.manage" },
      { label: "Announcements", href: "/admin/operations/announcements", perm: "ops.announce" },
      { label: "Usage", href: "/admin/operations/analytics", perm: "ops.analytics" },
      { label: "Backup & restore", href: "/admin/operations/backup", perm: "ops.backup" },
    ],
  },
];

export async function AdminNav() {
  const user = await getAdminContext();
  if (!user) return null;
  // Before MFA is satisfied only the set-up page and sign-out are usable.
  const limited = needsMfa(user);

  const groups: NavGroup[] = limited
    ? []
    : GROUPS.map((g) => ({
        label: g.label,
        items: g.items.filter((i) => can(user.role, i.perm)).map(({ label, href }) => ({ label, href })),
      })).filter((g) => g.items.length > 0);

  return (
    <nav aria-label="Admin" className="border-b" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
      <div className="mx-auto flex max-w-[1000px] flex-wrap items-center justify-between gap-2 px-4 py-2">
        <NavGroups groups={groups} />
        <div className="flex items-center gap-3 text-xs" style={{ color: "var(--faint)" }}>
          <Link href="/admin/account" className="truncate underline-offset-4 hover:underline">
            {user.email} · {ROLE_LABEL[user.role]}
          </Link>
          <Link href="/en" className="underline-offset-4 hover:underline">
            View site
          </Link>
          <form action={logout}>
            <button type="submit" className="rounded border px-3 text-xs"
              style={{ minHeight: 36, borderColor: "var(--control-border)", color: "var(--muted)" }}>
              Sign out
            </button>
          </form>
        </div>
      </div>
    </nav>
  );
}
