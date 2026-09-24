"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { transaction } from "@/lib/db/client";
import { requirePermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { isValidHex } from "@/lib/contrast";
import {
  BACKGROUNDS, BORDERS, CARD_STYLES, COLOR_TOKENS, DENSITIES, FONTS, PRESETS, RADII,
  describeGate, gate, sanitizeLook, type Look, type Palette,
} from "@/lib/design";
import { brandSchema } from "@/lib/theme-validate";
import { getLiveTheme, parseSnapshot, publishSnapshot, type ThemeSnapshot } from "@/lib/theme-store";
import { scheduleAutoTranslate } from "@/lib/auto-translate";

/**
 * Design Studio (capability 9), super admin only.
 *
 * Draft -> preview -> publish. Saving a draft never touches the public site.
 * Publishing re-validates everything on the server (brand text schema, fixed
 * lists, strict hex, the contrast gate) and a failing palette cannot be
 * published. Every publish and rollback leaves a version; rollback is one
 * click. No free-form CSS or HTML anywhere, and SVG logos stay refused.
 */

export type StudioState = {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
  warnings?: string[];
};

function refreshPublic() {
  revalidatePath("/", "layout");
}
function refreshAdmin() {
  revalidatePath("/admin/theme");
  revalidatePath("/admin/theme/preview");
  revalidatePath("/admin/theme/history");
}

/** Parses the studio form. Invalid values are REPORTED, never silently replaced. */
function parseStudio(formData: FormData): { snap?: ThemeSnapshot; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  const brand = brandSchema.safeParse({
    brandName: formData.get("brandName") ?? "",
    wordmarkPrimary: formData.get("wordmarkPrimary") ?? "",
    wordmarkSecondary: formData.get("wordmarkSecondary") ?? "",
    attribution: formData.get("attribution") ?? "",
    tagline: formData.get("tagline") ?? "",
    taglineAz: formData.get("tagline_az") ?? "",
    taglineRu: formData.get("tagline_ru") ?? "",
  });
  if (!brand.success) for (const i of brand.error.issues) fieldErrors[String(i.path[0])] ??= i.message;

  const palette = (mode: "light" | "dark") => {
    const p = {} as Palette;
    for (const t of COLOR_TOKENS) {
      const v = String(formData.get(`${mode}.${t}`) ?? "").trim().toLowerCase();
      if (!isValidHex(v)) fieldErrors[`${mode}.${t}`] = "Must be a 6-digit hex colour, e.g. #0f3c76.";
      p[t] = v;
    }
    return p;
  };
  const oneOf = <T,>(name: string, list: readonly T[], conv: (v: string) => T) => {
    const v = conv(String(formData.get(name) ?? ""));
    if (!list.includes(v)) fieldErrors[name] = "Choose one of the listed options.";
    return v;
  };
  const look: Look = {
    preset: String(formData.get("preset") ?? "").slice(0, 40) || undefined,
    light: palette("light"),
    dark: palette("dark"),
    design: {
      font: oneOf("font", FONTS.map((f) => f.id), (v) => v as Look["design"]["font"]),
      radius: oneOf("radius", RADII, (v) => Number(v) as Look["design"]["radius"]),
      border: oneOf("border", BORDERS, (v) => Number(v) as Look["design"]["border"]),
      card: oneOf("card", CARD_STYLES, (v) => v as Look["design"]["card"]),
      density: oneOf("density", DENSITIES, (v) => v as Look["design"]["density"]),
      background: oneOf("background", BACKGROUNDS, (v) => v as Look["design"]["background"]),
      accentRule: formData.get("accentRule") === "on",
    },
  };
  if (Object.keys(fieldErrors).length || !brand.success) return { fieldErrors };
  return { snap: { brand: brand.data, look }, fieldErrors };
}

export async function saveDraft(_prev: StudioState, formData: FormData): Promise<StudioState> {
  const user = await requirePermission("theme.manage");
  const { snap, fieldErrors } = parseStudio(formData);
  if (!snap) return { error: "Please fix the highlighted fields.", fieldErrors };
  const failures = gate(snap.look);
  await transaction(async (tx) => {
    await tx.query("update site_settings set theme_draft = $1 where id = 1", [
      JSON.stringify({ ...snap, savedAt: new Date().toISOString(), savedBy: user.email }),
    ]);
    await audit(tx, { actor: user.email, action: "theme.draft_save", area: "theme", target: "draft", after: { preset: snap.look.preset, gateFailures: failures.length } });
  });
  refreshAdmin();
  return failures.length
    ? { ok: "Draft saved — but it cannot be published until the contrast problems below are fixed.", warnings: describeGate(failures) }
    : { ok: "Draft saved. The public site is unchanged until you publish." };
}

export async function applyPreset(_prev: StudioState, formData: FormData): Promise<StudioState> {
  const user = await requirePermission("theme.manage");
  const preset = PRESETS.find((p) => p.id === String(formData.get("preset") ?? ""));
  if (!preset) return { error: "Unknown preset." };
  const { live, draft } = await getLiveTheme();
  const base = draft ?? live;
  await transaction(async (tx) => {
    await tx.query("update site_settings set theme_draft = $1 where id = 1", [
      JSON.stringify({ brand: base.brand, look: preset.look, savedAt: new Date().toISOString(), savedBy: user.email }),
    ]);
    await audit(tx, { actor: user.email, action: "theme.preset", area: "theme", target: "draft", after: { preset: preset.id } });
  });
  refreshAdmin();
  // A fresh URL remounts the studio form with the preset's values.
  redirect(`/admin/theme?applied=${encodeURIComponent(preset.id)}&t=${Date.now()}`);
}

export async function publishDraft(_prev: StudioState, _formData: FormData): Promise<StudioState> {
  const user = await requirePermission("theme.manage");
  const result = await transaction(async (tx): Promise<StudioState> => {
    const row = await tx.queryOne<{ theme_draft: unknown }>("select theme_draft from site_settings where id = 1 for update");
    const snap = row?.theme_draft ? parseSnapshot(row.theme_draft) : null;
    if (!snap) return { error: "There is no valid draft to publish." };
    // Re-validated on the server whatever the preview showed.
    const failures = gate(snap.look);
    if (failures.length) return { error: "This palette fails the contrast gate and cannot be published.", warnings: describeGate(failures) };
    const version = await publishSnapshot(tx, snap, user.email, snap.look.preset ? `Published (${snap.look.preset})` : "Published");
    await tx.query("update site_settings set theme_draft = null where id = 1");
    await audit(tx, { actor: user.email, action: "theme.publish", area: "theme", target: `version:${version}`, after: snap });
    return { ok: `Published as version #${version}. Every public page shows it within a minute.` };
  });
  if (!result.error) {
    refreshPublic();
    refreshAdmin();
    scheduleAutoTranslate("tagline", "site", user.email);
  }
  return result;
}

export async function discardDraft(_prev: StudioState, _formData: FormData): Promise<StudioState> {
  const user = await requirePermission("theme.manage");
  await transaction(async (tx) => {
    await tx.query("update site_settings set theme_draft = null where id = 1");
    await audit(tx, { actor: user.email, action: "theme.draft_discard", area: "theme", target: "draft" });
  });
  refreshAdmin();
  return { ok: "Draft discarded." };
}

export async function rollbackTheme(_prev: StudioState, formData: FormData): Promise<StudioState> {
  const user = await requirePermission("theme.manage");
  const id = Number(String(formData.get("versionId") ?? ""));
  if (!id) return { error: "No version specified." };
  const result = await transaction(async (tx): Promise<StudioState> => {
    const v = await tx.queryOne<{ snapshot: unknown }>("select snapshot from theme_versions where id = $1", [id]);
    const snap = v ? parseSnapshot(v.snapshot) : null;
    if (!snap) return { error: "That version no longer exists or cannot be read." };
    const failures = gate(snap.look);
    if (failures.length) return { error: "That version fails today's contrast gate, so it cannot be restored.", warnings: describeGate(failures) };
    const version = await publishSnapshot(tx, snap, user.email, `Rollback to version #${id}`);
    await audit(tx, { actor: user.email, action: "theme.rollback", area: "theme", target: `version:${version}`, after: { from: id } });
    return { ok: `Version #${id} is live again (recorded as #${version}).` };
  });
  if (!result.error) {
    refreshPublic();
    refreshAdmin();
  }
  return result;
}

// Raster only, SVG rejected -- an SVG can carry <script>.
const LOGO_MIME_ALLOWLIST = new Set(["image/png", "image/jpeg", "image/webp"]);
const LOGO_MAX_BYTES = 512 * 1024;

/** The logo is not versioned: it changes on its own, immediately. */
export async function saveLogo(_prev: StudioState, formData: FormData): Promise<StudioState> {
  const user = await requirePermission("theme.manage");
  const remove = formData.get("remove") === "on";
  let dataUrl: string | null = null;
  if (!remove) {
    const file = formData.get("logo");
    if (!(file instanceof File) || file.size === 0) return { error: "Choose a PNG, JPEG or WebP file." };
    if (!LOGO_MIME_ALLOWLIST.has(file.type)) return { error: "Logo must be PNG, JPEG or WebP. SVG is not accepted." };
    if (file.size > LOGO_MAX_BYTES) return { error: "Logo must be 512 KB or smaller." };
    // Check the file really is what it claims (magic bytes), not just its label.
    const bytes = Buffer.from(await file.arrayBuffer());
    const png = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const jpg = bytes[0] === 0xff && bytes[1] === 0xd8;
    const webp = bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP";
    if (!(png || jpg || webp)) return { error: "That file is not a real PNG, JPEG or WebP image." };
    dataUrl = `data:${file.type};base64,${bytes.toString("base64")}`;
  }
  await transaction(async (tx) => {
    await tx.query("update site_settings set logo_url = $1, updated_by = $2, updated_at = now() where id = 1", [dataUrl, user.email]);
    await audit(tx, { actor: user.email, action: remove ? "theme.logo_remove" : "theme.logo", area: "theme", target: "logo", after: { bytes: dataUrl ? dataUrl.length : 0 } });
  });
  refreshPublic();
  refreshAdmin();
  return { ok: remove ? "Logo removed." : "Logo saved. The favicon uses it too." };
}

/** Dates are whole days in Baku time (UTC+4): start at 00:00, end after the end day. */
function bakuDay(v: string, endOfDay: boolean): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00+04:00`);
  if (Number.isNaN(d.getTime())) return null;
  if (endOfDay) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

export async function addSchedule(_prev: StudioState, formData: FormData): Promise<StudioState> {
  const user = await requirePermission("theme.manage");
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 60) return { error: "Give the schedule a name (60 characters or fewer)." };
  const start = bakuDay(String(formData.get("start") ?? ""), false);
  const end = bakuDay(String(formData.get("end") ?? ""), true);
  if (!start || !end) return { error: "Choose a start and an end date." };
  if (end <= start) return { error: "The end date must be on or after the start date." };
  if (end.getTime() < Date.now()) return { error: "That period is already over." };

  const source = String(formData.get("source") ?? "");
  let look: Look | null = null;
  if (source.startsWith("preset:")) look = PRESETS.find((p) => p.id === source.slice(7))?.look ?? null;
  else if (source.startsWith("version:")) {
    const v = await transaction((tx) => tx.queryOne<{ snapshot: unknown }>("select snapshot from theme_versions where id = $1", [Number(source.slice(8))]));
    look = v ? parseSnapshot(v.snapshot)?.look ?? null : null;
  } else if (source === "draft") look = (await getLiveTheme()).draft?.look ?? null;
  if (!look) return { error: "Choose what the schedule should show." };
  look = sanitizeLook(look);
  const failures = gate(look);
  if (failures.length) return { error: "That look fails the contrast gate and cannot be scheduled.", warnings: describeGate(failures) };

  await transaction(async (tx) => {
    const row = await tx.queryOne<{ id: string }>(
      "insert into theme_schedules (name, look, starts_at, ends_at, created_by) values ($1, $2, $3, $4, $5) returning id::text",
      [name, JSON.stringify(look), start.toISOString(), end.toISOString(), user.email]
    );
    await audit(tx, { actor: user.email, action: "theme.schedule_add", area: "theme", target: `schedule:${row?.id}`, after: { name, source, start, end } });
  });
  refreshPublic();
  refreshAdmin();
  return { ok: `“${name}” scheduled.` };
}

export async function deleteSchedule(_prev: StudioState, formData: FormData): Promise<StudioState> {
  const user = await requirePermission("theme.manage");
  const id = Number(String(formData.get("id") ?? ""));
  const result = await transaction(async (tx): Promise<StudioState> => {
    const row = await tx.queryOne<{ name: string }>("delete from theme_schedules where id = $1 returning name", [id]);
    if (!row) return { error: "That schedule no longer exists." };
    await audit(tx, { actor: user.email, action: "theme.schedule_delete", area: "theme", target: `schedule:${id}`, before: row });
    return { ok: `“${row.name}” removed.` };
  });
  if (!result.error) {
    refreshPublic();
    refreshAdmin();
  }
  return result;
}
