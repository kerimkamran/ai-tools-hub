import "server-only";
import { query, type Tx } from "@/lib/db/client";
import { redactForAudit } from "@/lib/redact";

/**
 * The audit log (Admin Panel Plan, capability 4).
 *
 * Rule: an admin change and its audit row are written in the SAME
 * transaction (pass the `tx` from transaction()), so the log can never
 * disagree with the data. The table itself rejects UPDATE/DELETE/TRUNCATE
 * (see db/migrations/0006_foundation.sql).
 *
 * Secrets never enter the log: before/after pass through redactForAudit(),
 * and an API key change is written as "rotated, last4 …a1b2".
 */

export type AuditArea =
  | "accounts"
  | "security"
  | "auth"
  | "catalog"
  | "categories"
  | "kb"
  | "ai"
  | "theme"
  | "translations"
  | "operations";

export type AuditEntry = {
  actor: string;
  action: string;
  area: AuditArea;
  target?: string | null;
  before?: unknown;
  after?: unknown;
};

const SQL = `insert into audit_log (actor, action, area, target, before, after)
             values ($1, $2, $3, $4, $5, $6)`;

function params(e: AuditEntry) {
  return [
    e.actor.toLowerCase(),
    e.action,
    e.area,
    e.target ?? null,
    e.before === undefined ? null : JSON.stringify(redactForAudit(e.before)),
    e.after === undefined ? null : JSON.stringify(redactForAudit(e.after)),
  ];
}

export async function audit(tx: Tx, e: AuditEntry): Promise<void> {
  await tx.query(SQL, params(e));
}

/** For events that are not part of a data change (sign-ins). Never throws. */
export async function auditStandalone(e: AuditEntry): Promise<void> {
  try {
    await query(SQL, params(e));
  } catch (err) {
    console.error("[audit] write failed:", err instanceof Error ? err.message : err);
  }
}

/** Failed sign-in for an email that is not an account: a daily count only. */
export async function countUnknownFailure(): Promise<void> {
  try {
    await query(
      `insert into auth_failures_daily (day, count) values (current_date, 1)
       on conflict (day) do update set count = auth_failures_daily.count + 1`
    );
  } catch {
    // best effort
  }
}
