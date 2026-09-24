import "server-only";
import { query } from "@/lib/db/client";

export type AuditFilter = { actor?: string; area?: string; from?: string; to?: string };
export type AuditRow = {
  id: string;
  at: string;
  actor: string;
  action: string;
  area: string;
  target: string | null;
  before: unknown;
  after: unknown;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseAuditFilter(sp: Record<string, string | string[] | undefined>): AuditFilter {
  const one = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v.trim() : "";
  };
  return {
    actor: one("actor").toLowerCase().slice(0, 254) || undefined,
    area: /^[a-z]+$/.test(one("area")) ? one("area") : undefined,
    from: DATE.test(one("from")) ? one("from") : undefined,
    to: DATE.test(one("to")) ? one("to") : undefined,
  };
}

export async function searchAudit(f: AuditFilter, limit = 200): Promise<AuditRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.actor) {
    params.push(`%${f.actor}%`);
    where.push(`(actor ilike $${params.length} or target ilike $${params.length})`);
  }
  if (f.area) {
    params.push(f.area);
    where.push(`area = $${params.length}`);
  }
  if (f.from) {
    params.push(f.from);
    where.push(`at >= $${params.length}::date`);
  }
  if (f.to) {
    params.push(f.to);
    where.push(`at < ($${params.length}::date + 1)`);
  }
  params.push(limit);
  return query<AuditRow>(
    `select id::text, at, actor, action, area, target, before, after from audit_log
      ${where.length ? `where ${where.join(" and ")}` : ""}
      order by at desc, id desc limit $${params.length}`,
    params
  );
}

/** The keys whose values differ between before and after, for a compact diff. */
export function changedKeys(before: unknown, after: unknown): string[] {
  const b = (before && typeof before === "object" ? before : {}) as Record<string, unknown>;
  const a = (after && typeof after === "object" ? after : {}) as Record<string, unknown>;
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  return [...keys].filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]));
}
