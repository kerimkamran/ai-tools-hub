/**
 * The permission map (Admin Panel Plan, capability 2).
 *
 * Lives in code on purpose: it is versioned, reviewed and tested like any
 * other code. The database stores only WHO has which role (admin_users.role;
 * super admin comes from SUPER_ADMIN_EMAILS and is never stored), never what
 * a role may do. There is no permission-editing UI, and no UI path can grant
 * super admin.
 *
 * Client-safe: no server imports, so the admin nav can hide what a role
 * cannot use. Hiding is cosmetic -- requirePermission() in src/lib/auth.ts is
 * the boundary, and every admin page and non-public Server Action calls it
 * (tests/permissions.test.mts fails the build otherwise).
 */

export type Role = "super" | "admin" | "editor" | "staff";

export const ROLE_LABEL: Record<Role, string> = {
  super: "Super admin",
  admin: "Admin",
  editor: "Editor",
  staff: "Staff",
};

export const PERMISSIONS = {
  // People & security
  "accounts.manage": ["super"],            // every account type
  "accounts.staff": ["super", "admin"],    // staff accounts only
  "security.manage": ["super"],
  "audit.view": ["super"],
  "self.manage": ["super", "admin", "editor"], // own password, MFA, sessions

  // Content
  "catalog.view": ["super", "admin", "editor"],
  "catalog.edit": ["super", "admin"],      // any status, publish, delete
  "catalog.draft": ["super", "admin", "editor"], // create/edit drafts only
  "categories.manage": ["super", "admin"],
  "kb.edit": ["super", "admin"],
  "kb.draft": ["super", "admin", "editor"],
  "tagline.edit": ["super"],
  "translations.view": ["super", "admin", "editor"],
  // Translating published content. Editors translate DRAFTS only (checked
  // per item in the action); the tagline additionally needs tagline.edit.
  "translations.edit": ["super", "admin"],

  // AI
  "ai.manage": ["super"],
  // Conversation insights: stored question/answer text is super-admin only.
  "insights.view": ["super"],

  // Brand & operations
  "theme.manage": ["super"],
  "ops.analytics": ["super", "admin"],
  "ops.announce": ["super", "admin"],
  // Backup & restore replaces content wholesale: super admin only.
  "ops.backup": ["super"],

  // Using the assistant (not an admin capability)
  "assistant.use": ["super", "admin", "editor", "staff"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

/** Roles that may enter /admin at all. */
export const ADMIN_ROLES: readonly Role[] = ["super", "admin", "editor"];

export function isAdminRole(role: Role | null | undefined): boolean {
  return Boolean(role && ADMIN_ROLES.includes(role));
}

/**
 * Server Actions that are deliberately callable without a permission,
 * because they are how a person GETS a session. tests/permissions.test.mts
 * checks that every other exported "use server" function calls
 * requirePermission().
 */
export const PUBLIC_SERVER_ACTIONS = [
  "login",
  "logout",
  "acceptInvite",
  "assistantLogin",
  "assistantLogout",
  "verifyMfa",
] as const;
