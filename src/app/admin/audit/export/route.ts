import { requirePermission } from "@/lib/auth";
import { parseAuditFilter, searchAudit } from "@/lib/audit-query";
import { redactForAudit } from "@/lib/redact";

export const dynamic = "force-dynamic";

function cell(v: unknown): string {
  const s = v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(redactForAudit(v));
  // Neutralise spreadsheet formula injection, then quote.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** CSV export of the audit log (super admin). Same filters as the page. */
export async function GET(request: Request) {
  await requirePermission("audit.view");
  const sp = Object.fromEntries(new URL(request.url).searchParams.entries());
  const rows = await searchAudit(parseAuditFilter(sp), 50_000);
  const lines = [
    ["at", "actor", "action", "area", "target", "before", "after"].map(cell).join(","),
    ...rows.map((r) =>
      [new Date(r.at).toISOString(), r.actor, r.action, r.area, r.target, r.before, r.after].map(cell).join(",")
    ),
  ];
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
