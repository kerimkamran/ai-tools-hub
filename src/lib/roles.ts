import "server-only";
import { queryOne } from "@/lib/db/client";
import type { Role } from "@/lib/permissions";

/**
 * Who is what. Super admin comes ONLY from SUPER_ADMIN_EMAILS -- never from a
 * row -- so nobody who compromises the database can create, promote or
 * remove one. Then admin_users.role (admin | editor), then staff_users.
 * No server-only Next APIs here, so src/proxy.ts can use it too.
 */

export function superAdminEmails(): string[] {
  return (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return superAdminEmails().includes(email.toLowerCase());
}

export async function resolveRole(email: string | null | undefined): Promise<Role | null> {
  if (!email) return null;
  const e = email.toLowerCase();
  if (isSuperAdminEmail(e)) return "super";
  try {
    const row = await queryOne<{ role: Role | null; staff: boolean }>(
      `select (select role from admin_users where email = $1) as role,
              exists (select 1 from staff_users where email = $1) as staff`,
      [e]
    );
    if (row?.role === "admin" || row?.role === "editor") return row.role;
    if (row?.staff) return "staff";
    return null;
  } catch (err) {
    // Fail closed: an unreachable database means "no role".
    console.error("[roles] lookup failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** MFA is always required for super admins; the policy can require it for all admins. */
export function mfaRequiredFor(role: Role | null, mfaRequiredAdmins: boolean): boolean {
  if (role === "super") return true;
  if (role === "admin" || role === "editor") return mfaRequiredAdmins;
  return false;
}
