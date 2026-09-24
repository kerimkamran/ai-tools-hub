import "server-only";
import { queryOne } from "@/lib/db/client";

/**
 * The security policy row (capability 3). Every value is bounded by a CHECK
 * constraint in db/migrations/0006_foundation.sql as well as by the form, so
 * no path can store an unsafe value. Reads fall back to the shipped
 * defaults if the row cannot be read -- the defaults are the SAFE values.
 */
export type SecurityPolicy = {
  idleMinutes: number;
  absoluteHours: number;
  mfaRequiredAdmins: boolean;
  lockoutThreshold: number;
  lockoutMinutes: number;
};

export const DEFAULT_POLICY: SecurityPolicy = {
  idleMinutes: 60,
  absoluteHours: 12,
  mfaRequiredAdmins: false,
  lockoutThreshold: 5,
  lockoutMinutes: 15,
};

export const POLICY_BOUNDS = {
  idleMinutes: [5, 480],
  absoluteHours: [1, 72],
  lockoutThreshold: [3, 10],
  lockoutMinutes: [5, 120],
} as const;

/**
 * Fixed, shown in the panel, never editable (a CHECK constraint on
 * staff_users -- see db/migrations/0011_staff_domains.sql). One Azerconnect
 * Group address per domain family; staff sign-in (and the self-service
 * email link) is open to any of them.
 */
export const STAFF_DOMAINS = ["@azerconnect.az", "@uninet.az", "@ultranet.az", "@goldenpay.az"] as const;

export function isStaffDomain(email: string): boolean {
  const e = email.trim().toLowerCase();
  return STAFF_DOMAINS.some((d) => e.endsWith(d));
}

export function staffDomainsLabel(): string {
  return STAFF_DOMAINS.join(", ");
}

type Row = {
  idle_minutes: number;
  absolute_hours: number;
  mfa_required_admins: boolean;
  lockout_threshold: number;
  lockout_minutes: number;
};

export function rowToPolicy(r: Row | null | undefined): SecurityPolicy {
  if (!r) return DEFAULT_POLICY;
  return {
    idleMinutes: r.idle_minutes,
    absoluteHours: r.absolute_hours,
    mfaRequiredAdmins: r.mfa_required_admins,
    lockoutThreshold: r.lockout_threshold,
    lockoutMinutes: r.lockout_minutes,
  };
}

export async function getSecurityPolicy(): Promise<SecurityPolicy> {
  try {
    return rowToPolicy(
      await queryOne<Row>(
        "select idle_minutes, absolute_hours, mfa_required_admins, lockout_threshold, lockout_minutes from security_policy where id = 1"
      )
    );
  } catch {
    return DEFAULT_POLICY;
  }
}
