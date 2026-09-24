"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { transaction } from "@/lib/db/client";
import { requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";

/**
 * The assistant's switch, overall monthly budget, per-user limits and the
 * transcript switch. Super admin only. Keys and models are per connection /
 * purpose since Phase 3 (AI → Connections).
 */

export type AiSettingsState = { error?: string; ok?: boolean };

const schema = z.object({
  enabled: z.boolean(),
  monthlyBudgetUsd: z.coerce.number().min(0).max(100000),
  hourlyLimit: z.coerce.number().int().min(1).max(500),
  dailyLimit: z.coerce.number().int().min(1).max(5000),
  storeTranscripts: z.boolean(),
  autoTranslate: z.boolean(),
});

export async function saveAiSettings(_prev: AiSettingsState, formData: FormData): Promise<AiSettingsState> {
  const superAdmin = await requirePermission("ai.manage");
  const parsed = schema.safeParse({
    enabled: formData.get("enabled") === "on",
    monthlyBudgetUsd: formData.get("monthlyBudgetUsd"),
    hourlyLimit: formData.get("hourlyLimit"),
    dailyLimit: formData.get("dailyLimit"),
    storeTranscripts: formData.get("storeTranscripts") === "on",
    autoTranslate: formData.get("autoTranslate") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const s = parsed.data;
  if (s.dailyLimit < s.hourlyLimit) return { error: "The daily limit cannot be lower than the hourly limit." };

  const SNAP = `select enabled, monthly_budget_usd::text as budget, hourly_limit, daily_limit, store_transcripts, auto_translate from ai_settings where id = 1`;
  await transaction(async (tx) => {
    const before = await tx.queryOne<{ store_transcripts: boolean }>(SNAP);
    await tx.query(
      `update ai_settings set enabled = $1, monthly_budget_usd = $2, hourly_limit = $3, daily_limit = $4,
         store_transcripts = $5, auto_translate = $7, updated_by = $6, updated_at = now() where id = 1`,
      [s.enabled, s.monthlyBudgetUsd, s.hourlyLimit, s.dailyLimit, s.storeTranscripts, superAdmin.email, s.autoTranslate]
    );
    // Switching text storage off deletes what was kept: "off" means no text.
    if (before?.store_transcripts && !s.storeTranscripts) await tx.query("delete from assistant_transcripts");
    await audit(tx, { actor: superAdmin.email, action: "ai.settings", area: "ai", target: "assistant", before, after: await tx.queryOne(SNAP) });
  });

  revalidatePath("/admin/assistant");
  revalidatePath("/", "layout");
  return { ok: true };
}
