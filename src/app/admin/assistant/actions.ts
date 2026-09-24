"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { query } from "@/lib/db/client";
import { getSuperAdminOrNull } from "@/lib/auth";
import { MODELS } from "@/lib/ai-settings";
import { sealSecret } from "@/lib/secret-box";

/**
 * AI settings are super-admin only, like roles and theme. The API key is
 * write-only from the UI's point of view: it is encrypted here and never
 * read back out to any page -- the settings page only ever shows its last
 * four characters.
 */

export type AiSettingsState = { error?: string; ok?: boolean };

const schema = z.object({
  model: z.enum(MODELS.map((m) => m.id) as [string, ...string[]]),
  enabled: z.boolean(),
  monthlyBudgetUsd: z.coerce.number().min(0).max(100000),
  hourlyLimit: z.coerce.number().int().min(1).max(500),
  apiKey: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(v), {
      message: "That does not look like an Anthropic API key (it should start with sk-ant-).",
    }),
  removeKey: z.boolean(),
});

export async function saveAiSettings(
  _prev: AiSettingsState,
  formData: FormData
): Promise<AiSettingsState> {
  const superAdmin = await getSuperAdminOrNull();
  if (!superAdmin) return { error: "Not signed in as a super admin." };

  const parsed = schema.safeParse({
    model: formData.get("model"),
    enabled: formData.get("enabled") === "on",
    monthlyBudgetUsd: formData.get("monthlyBudgetUsd"),
    hourlyLimit: formData.get("hourlyLimit"),
    apiKey: String(formData.get("apiKey") ?? ""),
    removeKey: formData.get("removeKey") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const s = parsed.data;

  let keySql = "";
  const params: unknown[] = [s.model, s.enabled, s.monthlyBudgetUsd, s.hourlyLimit, superAdmin.email];
  if (s.removeKey) {
    keySql = ", api_key_encrypted = null, api_key_last4 = null";
  } else if (s.apiKey) {
    let sealed: string;
    try {
      sealed = sealSecret(s.apiKey);
    } catch {
      return { error: "Cannot encrypt the key: AUTH_SECRET or SETTINGS_ENCRYPTION_KEY must be set." };
    }
    params.push(sealed, s.apiKey.slice(-4));
    keySql = ", api_key_encrypted = $6, api_key_last4 = $7";
  }

  await query(
    `update ai_settings set model = $1, enabled = $2, monthly_budget_usd = $3,
       hourly_limit = $4, updated_by = $5, updated_at = now()${keySql}
     where id = 1`,
    params
  );

  revalidatePath("/admin/assistant");
  return { ok: true };
}
