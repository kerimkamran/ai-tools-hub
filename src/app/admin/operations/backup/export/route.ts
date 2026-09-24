import { requirePermission } from "@/lib/auth";
import { auditStandalone } from "@/lib/audit";
import { queryOne } from "@/lib/db/client";
import { exportContent } from "@/lib/backup";

/** JSON export of content (no accounts, keys, audit log or conversations). ?saved=<id> downloads an automatic pre-restore export. */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await requirePermission("ops.backup");
  const saved = new URL(request.url).searchParams.get("saved");
  let data: unknown;
  let name: string;
  if (saved && /^\d+$/.test(saved)) {
    const row = await queryOne<{ data: unknown; created_at: Date }>("select data, created_at from backups where id = $1", [Number(saved)]);
    if (!row) return new Response("Not found", { status: 404 });
    data = row.data;
    name = `one-simple-before-restore-${saved}.json`;
  } else {
    data = await exportContent();
    name = `one-simple-backup-${new Date().toISOString().slice(0, 10)}.json`;
  }
  await auditStandalone({ actor: user.email, action: "ops.export", area: "operations", target: saved ? `backup:${saved}` : "content" });
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
