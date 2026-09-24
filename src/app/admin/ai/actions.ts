"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { transaction } from "@/lib/db/client";
import { requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sealSecret } from "@/lib/secret-box";
import { connectionKey, validateConfig, validateKey } from "@/lib/connections";
import { testProvider } from "@/lib/provider-test";
import { PURPOSES, providerById, type ProviderId, type PurposeId } from "@/lib/providers";

/**
 * API connections and purposes (capability 7). Super admin only.
 *
 * The key is WRITE-ONLY: it arrives in a form field, is validated and
 * encrypted here, and nothing ever sends it back. Audit rows record only
 * provider, label and last four. Error messages never echo the key.
 */

export type ConnState = { error?: string; ok?: string };

const labelSchema = z.string().trim().min(1, "Give the connection a name.").max(60, "60 characters or fewer.");
const capSchema = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 100000), "The cap must be a number between 0 and 100000.");

const TEST_COOLDOWN_SECONDS = 20;

function refresh() {
  revalidatePath("/admin/ai/connections");
  revalidatePath("/admin/assistant");
}

export async function saveConnection(_prev: ConnState, formData: FormData): Promise<ConnState> {
  const user = await requirePermission("ai.manage");
  const idRaw = String(formData.get("id") ?? "").trim();
  const id = idRaw ? Number(idRaw) : null;

  const label = labelSchema.safeParse(formData.get("label") ?? "");
  if (!label.success) return { error: label.error.issues[0].message };
  const cap = capSchema.safeParse(String(formData.get("monthlyCap") ?? ""));
  if (!cap.success) return { error: cap.error.issues[0].message };
  const key = String(formData.get("apiKey") ?? "").trim();

  const result = await transaction(async (tx): Promise<ConnState & { newId?: number }> => {
    let provider: ProviderId;
    let before: { provider: ProviderId; label: string; key_last4: string | null; config: unknown; monthly_cap_usd: string | null } | null = null;
    if (id) {
      before = await tx.queryOne("select provider, label, key_last4, config, monthly_cap_usd::text from api_connections where id = $1 for update", [id]);
      if (!before) return { error: "That connection no longer exists." };
      provider = before.provider; // the provider of a saved connection never changes
    } else {
      const p = String(formData.get("provider") ?? "");
      if (!providerById(p)) return { error: "Choose a provider." };
      provider = p as ProviderId;
      if (!key) return { error: "Paste the API key." };
    }

    const raw: Record<string, string> = {};
    for (const f of providerById(provider)!.fields) raw[f.key] = String(formData.get(`cfg:${f.key}`) ?? "");
    const cfg = validateConfig(provider, raw);
    if (!cfg.ok) return { error: cfg.error };

    let sealed: string | null = null;
    if (key) {
      const bad = validateKey(provider, key);
      if (bad) return { error: bad };
      try {
        sealed = sealSecret(key);
      } catch {
        return { error: "Cannot encrypt the key: AUTH_SECRET or SETTINGS_ENCRYPTION_KEY must be set." };
      }
    }
    const last4 = key ? key.slice(-4) : before?.key_last4 ?? null;

    let rowId = id;
    if (id) {
      await tx.query(
        `update api_connections set label = $2, config = $3, monthly_cap_usd = $4, updated_at = now()
           ${sealed ? ", key_encrypted = $5, key_last4 = $6, last_test_ok = null, last_test_message = null" : ""}
         where id = $1`,
        sealed ? [id, label.data, JSON.stringify(cfg.config), cap.data, sealed, last4] : [id, label.data, JSON.stringify(cfg.config), cap.data]
      );
    } else {
      const row = await tx.queryOne<{ id: string }>(
        `insert into api_connections (provider, label, config, key_encrypted, key_last4, monthly_cap_usd, created_by)
         values ($1, $2, $3, $4, $5, $6, $7) returning id::text`,
        [provider, label.data, JSON.stringify(cfg.config), sealed, last4, cap.data, user.email]
      );
      rowId = Number(row?.id);
    }
    await audit(tx, {
      actor: user.email,
      action: id ? "ai.connection_edit" : "ai.connection_add",
      area: "ai",
      target: `connection:${rowId}`,
      before: before ? { provider: before.provider, label: before.label, last4: before.key_last4, config: before.config, cap: before.monthly_cap_usd } : undefined,
      after: { provider, label: label.data, last4, config: cfg.config, cap: cap.data, key: key ? `set, last4 …${last4}` : "unchanged" },
    });
    return { ok: id ? "Saved." : "Connection added.", newId: rowId ?? undefined };
  });
  if (result.error) return { error: result.error };
  refresh();
  if (!id) redirect(`/admin/ai/connections?added=${result.newId}`);
  return { ok: result.ok };
}

export async function connectionAction(_prev: ConnState, formData: FormData): Promise<ConnState> {
  const user = await requirePermission("ai.manage");
  const op = String(formData.get("op") ?? "");
  const id = Number(String(formData.get("id") ?? ""));
  if (!id) return { error: "No connection specified." };

  if (op === "test") {
    const row = await transaction((tx) =>
      tx.queryOne<{ provider: ProviderId; label: string; config: Record<string, string>; recent: boolean }>(
        `select provider, label, config,
                coalesce(last_tested_at > now() - make_interval(secs => $2), false) as recent
           from api_connections where id = $1`,
        [id, TEST_COOLDOWN_SECONDS]
      )
    );
    if (!row) return { error: "That connection no longer exists." };
    if (row.recent) return { error: `Tested a moment ago. Wait ${TEST_COOLDOWN_SECONDS} seconds between tests.` };
    const key = await connectionKey(id);
    if (!key) return { error: "No readable key: paste the key again (it may have been saved under a different encryption key)." };
    const r = await testProvider(row.provider, row.config ?? {}, key);
    await transaction(async (tx) => {
      await tx.query(
        "update api_connections set last_tested_at = now(), last_test_ok = $2, last_test_message = $3 where id = $1",
        [id, r.ok, r.message]
      );
      await audit(tx, { actor: user.email, action: "ai.connection_test", area: "ai", target: `connection:${id}`, after: { label: row.label, ok: r.ok, message: r.message } });
    });
    refresh();
    return r.ok ? { ok: r.message } : { error: r.message };
  }

  const result = await transaction(async (tx): Promise<ConnState> => {
    const c = await tx.queryOne<{ provider: ProviderId; label: string; key_last4: string | null; enabled: boolean }>(
      "select provider, label, key_last4, enabled from api_connections where id = $1 for update",
      [id]
    );
    if (!c) return { error: "That connection no longer exists." };
    const used = await tx.query<{ purpose: PurposeId }>("select purpose from ai_purposes where connection_id = $1", [id]);
    const usedNames = used.map((u) => PURPOSES.find((p) => p.id === u.purpose)?.label ?? u.purpose);

    if (op === "enable" || op === "disable") {
      const enabled = op === "enable";
      await tx.query("update api_connections set enabled = $2, updated_at = now() where id = $1", [id, enabled]);
      await audit(tx, { actor: user.email, action: `ai.connection_${op}`, area: "ai", target: `connection:${id}`, after: { label: c.label, enabled } });
      return {
        ok: enabled ? "Enabled." : usedNames.length ? `Disabled. ${usedNames.join(" and ")} will stop working until you enable it or move the purpose.` : "Disabled.",
      };
    }

    if (op === "set_default") {
      const purpose = String(formData.get("purpose") ?? "") as PurposeId;
      if (!PURPOSES.some((p) => p.id === purpose)) return { error: "Unknown purpose." };
      const t = providerById(c.provider);
      if (!t?.adapter) return { error: `${t?.name ?? "This provider"} cannot power a purpose yet — only providers with a built-in adapter can (Anthropic today).` };
      const current = await tx.queryOne<{ model: string; connection_id: string | null }>("select model, connection_id::text from ai_purposes where purpose = $1", [purpose]);
      const model = t.models?.some((m) => m.id === current?.model) ? current!.model : t.models![0].id;
      await tx.query(
        `insert into ai_purposes (purpose, connection_id, model, updated_by, updated_at) values ($1, $2, $3, $4, now())
         on conflict (purpose) do update set connection_id = $2, model = $3, updated_by = $4, updated_at = now()`,
        [purpose, id, model, user.email]
      );
      await audit(tx, { actor: user.email, action: "ai.purpose", area: "ai", target: purpose, before: current, after: { connection: c.label, model } });
      return { ok: `${c.label} now serves ${PURPOSES.find((p) => p.id === purpose)!.label}.` };
    }

    if (op === "delete") {
      if (usedNames.length) return { error: `In use by ${usedNames.join(" and ")}. Move ${usedNames.length > 1 ? "them" : "it"} to another connection first.` };
      const confirm = String(formData.get("confirm") ?? "").trim();
      if (confirm.toLowerCase() !== c.label.toLowerCase()) return { error: `Type ${c.label} to delete this connection.` };
      // Deleting the row wipes the encrypted key; the log keeps only these three facts.
      await tx.query("delete from api_connections where id = $1", [id]);
      await audit(tx, { actor: user.email, action: "ai.connection_delete", area: "ai", target: `connection:${id}`, before: { provider: c.provider, label: c.label, last4: c.key_last4 } });
      return { ok: `${c.label} deleted.` };
    }
    return { error: "Unknown action." };
  });
  if (!result.error) refresh();
  return result;
}

export async function savePurposes(_prev: ConnState, formData: FormData): Promise<ConnState> {
  const user = await requirePermission("ai.manage");
  const result = await transaction(async (tx): Promise<ConnState> => {
    const before = await tx.query("select purpose, connection_id::text, model from ai_purposes order by purpose");
    for (const p of PURPOSES) {
      const cid = Number(String(formData.get(`conn:${p.id}`) ?? ""));
      const model = String(formData.get(`model:${p.id}`) ?? "");
      if (!cid) return { error: `Choose a connection for ${p.label}.` };
      const c = await tx.queryOne<{ provider: ProviderId; label: string }>("select provider, label from api_connections where id = $1", [cid]);
      if (!c) return { error: `The connection chosen for ${p.label} no longer exists.` };
      const t = providerById(c.provider);
      if (!t?.adapter) return { error: `${c.label} (${t?.name}) cannot power ${p.label} — no adapter yet.` };
      if (!t.models?.some((m) => m.id === model)) return { error: `Choose a ${t.name} model for ${p.label}.` };
      await tx.query(
        `insert into ai_purposes (purpose, connection_id, model, updated_by, updated_at) values ($1, $2, $3, $4, now())
         on conflict (purpose) do update set connection_id = $2, model = $3, updated_by = $4, updated_at = now()`,
        [p.id, cid, model, user.email]
      );
    }
    await audit(tx, { actor: user.email, action: "ai.purposes", area: "ai", target: "purposes", before, after: await tx.query("select purpose, connection_id::text, model from ai_purposes order by purpose") });
    return { ok: "Saved." };
  });
  if (!result.error) refresh();
  return result;
}
