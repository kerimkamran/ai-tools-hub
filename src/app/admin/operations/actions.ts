"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { transaction } from "@/lib/db/client";
import { requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { scheduleTranslateTexts } from "@/lib/auto-translate";
import { applyBackup, diffBackups, exportContent, fingerprint, validateBackup, type TableDiff } from "@/lib/backup";

/** Operations (capability 10): announcements and backup & restore. */

export type OpsState = { error?: string; ok?: string; errors?: string[]; diff?: TableDiff[]; fingerprint?: string; backupId?: number };

const bakuDay = (v: string, end: boolean) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00+04:00`);
  if (end) d.setUTCDate(d.getUTCDate() + 1);
  return Number.isNaN(d.getTime()) ? null : d;
};

const annSchema = z.object({
  severity: z.enum(["info", "warning", "critical"]),
  text: z.string().trim().min(1, "Write the announcement.").max(240, "240 characters or fewer."),
});

export async function saveAnnouncement(_prev: OpsState, formData: FormData): Promise<OpsState> {
  const user = await requirePermission("ops.announce");
  const p = annSchema.safeParse({ severity: formData.get("severity"), text: formData.get("text") ?? "" });
  if (!p.success) return { error: p.error.issues[0].message };
  const startRaw = String(formData.get("start") ?? "");
  const endRaw = String(formData.get("end") ?? "");
  const start = startRaw ? bakuDay(startRaw, false) : new Date();
  const end = endRaw ? bakuDay(endRaw, true) : null;
  if (!start) return { error: "Choose a valid start date." };
  if (endRaw && !end) return { error: "Choose a valid end date." };
  if (end && end <= start) return { error: "The end date must be on or after the start date." };
  if (end && end.getTime() <= Date.now()) return { error: "That period is already over." };

  const id = await transaction(async (tx) => {
    const row = await tx.queryOne<{ id: string }>(
      "insert into announcements (severity, text_en, starts_at, ends_at, created_by) values ($1, $2, $3, $4, $5) returning id::text",
      [p.data.severity, p.data.text, start.toISOString(), end ? end.toISOString() : null, user.email]
    );
    await audit(tx, { actor: user.email, action: "ops.announcement_add", area: "operations", target: `announcement:${row?.id}`, after: { ...p.data, start, end } });
    return Number(row?.id);
  });
  // English only: AZ/RU are translated in the background.
  scheduleTranslateTexts(user.email, { text: p.data.text }, { text: 240 }, async (out) => {
    await transaction((tx) =>
      tx.query("update announcements set text_az = $2, text_ru = $3 where id = $1 and text_en = $4", [id, out.az.text ?? "", out.ru.text ?? "", p.data.text])
    );
  });
  revalidatePath("/", "layout");
  return { ok: "Announcement saved. It appears on every public page within a minute (translated automatically)." };
}

export async function announcementAction(_prev: OpsState, formData: FormData): Promise<OpsState> {
  const user = await requirePermission("ops.announce");
  const op = String(formData.get("op") ?? "");
  const id = Number(String(formData.get("id") ?? ""));
  const result = await transaction(async (tx): Promise<OpsState> => {
    const row = await tx.queryOne<{ text_en: string }>("select text_en from announcements where id = $1 for update", [id]);
    if (!row) return { error: "That announcement no longer exists." };
    if (op === "end") {
      await tx.query("update announcements set ends_at = greatest(now(), starts_at + interval '1 second') where id = $1", [id]);
      await audit(tx, { actor: user.email, action: "ops.announcement_end", area: "operations", target: `announcement:${id}` });
      return { ok: "Ended." };
    }
    if (op === "delete") {
      await tx.query("delete from announcements where id = $1", [id]);
      await audit(tx, { actor: user.email, action: "ops.announcement_delete", area: "operations", target: `announcement:${id}`, before: row });
      return { ok: "Deleted." };
    }
    return { error: "Unknown action." };
  });
  if (!result.error) revalidatePath("/", "layout");
  return result;
}

async function readUpload(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a backup file (.json)." } as const;
  if (file.size > 9 * 1024 * 1024) return { error: "That file is too large for a One.Simple backup." } as const;
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    return { error: "That file is not valid JSON." } as const;
  }
  const v = validateBackup(raw);
  if (!v.ok) return { error: "The backup did not pass validation. Nothing was changed.", errors: v.errors } as const;
  return { backup: v.backup } as const;
}

/** Step 1: validate + dry-run diff. Changes nothing. */
export async function previewRestore(_prev: OpsState, formData: FormData): Promise<OpsState> {
  await requirePermission("ops.backup");
  const up = await readUpload(formData);
  if ("error" in up) return { error: up.error, errors: "errors" in up ? [...(up.errors ?? [])] : undefined };
  const current = await exportContent();
  return { diff: diffBackups(current, up.backup), fingerprint: fingerprint(up.backup), ok: "Dry run only — nothing has changed yet." };
}

/** Step 2: typed confirmation, automatic export of the current state, then replace. */
export async function applyRestore(_prev: OpsState, formData: FormData): Promise<OpsState> {
  const user = await requirePermission("ops.backup");
  if (String(formData.get("confirm") ?? "").trim().toLowerCase() !== "restore") return { error: "Type restore to confirm." };
  const up = await readUpload(formData);
  if ("error" in up) return { error: up.error, errors: "errors" in up ? [...(up.errors ?? [])] : undefined };
  if (String(formData.get("fingerprint") ?? "") !== fingerprint(up.backup)) return { error: "The file changed since the dry run. Run the dry run again." };

  const backupId = await transaction(async (tx) => {
    const before = await exportContent(tx.query);
    const saved = await tx.queryOne<{ id: string }>(
      "insert into backups (created_by, reason, data) values ($1, 'Automatic export before restore', $2) returning id::text",
      [user.email, JSON.stringify(before)]
    );
    await applyBackup(tx, up.backup);
    const counts = Object.fromEntries(Object.entries(up.backup.tables).map(([k, v]) => [k, Array.isArray(v) ? v.length : 1]));
    await audit(tx, { actor: user.email, action: "ops.restore", area: "operations", target: `backup:${saved?.id}`, after: { restoredFrom: up.backup.exportedAt, counts } });
    return Number(saved?.id);
  });
  revalidatePath("/", "layout");
  return { ok: `Restored. The previous state was saved first (download it below as #${backupId}).`, backupId };
}
