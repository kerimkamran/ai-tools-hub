import { createHash } from "node:crypto";
import type { TranslatedLocale } from "./i18n";

// Self-contained on purpose (no runtime relative imports) so the test can
// load it directly with Node. Same values as src/lib/i18n.ts and
// src/lib/source-hash.ts; tests/translation-status.test.mts checks the hash
// against the SQL function's output.
const TRANSLATED_LOCALES: readonly TranslatedLocale[] = ["az", "ru"];
export function sourceHash(text: string | null | undefined): string {
  return createHash("sha256").update(text ?? "", "utf8").digest("hex").slice(0, 16);
}

/**
 * Translation status (Admin Panel Plan, capability 6). Pure functions, no
 * database -- shared by the dashboard, the editors and the save actions.
 *
 * i18n      = { az: { field: "text" }, ru: {...} }        (the translations)
 * i18n_meta = { az: { field: { src, review } }, ru: {...} } (their provenance)
 *
 * A translation is STALE when the English it was written against (src) is
 * not the English there now; NEEDS REVIEW when review is true (an AI draft,
 * until a person saves or confirms it).
 */

export type FieldStatus = "ok" | "missing" | "stale" | "review" | "na";

export type FieldMeta = { src?: string; review?: boolean; machine?: boolean };
export type I18nMeta = Partial<Record<TranslatedLocale, Record<string, FieldMeta>>>;
export type I18nValues = Partial<Record<TranslatedLocale, Record<string, string | undefined>>>;

export const STATUS_LABEL: Record<FieldStatus, string> = {
  ok: "Up to date",
  missing: "Missing",
  stale: "Needs update",
  review: "Needs review",
  na: "—",
};

export function sanitizeMeta(raw: unknown): I18nMeta {
  const out: I18nMeta = {};
  if (!raw || typeof raw !== "object") return out;
  for (const loc of TRANSLATED_LOCALES) {
    const entry = (raw as Record<string, unknown>)[loc];
    if (!entry || typeof entry !== "object") continue;
    const fields: Record<string, FieldMeta> = {};
    for (const [k, v] of Object.entries(entry as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const m = v as Record<string, unknown>;
      fields[k] = {
        src: typeof m.src === "string" ? m.src : undefined,
        review: m.review === true,
        ...(m.machine === true ? { machine: true } : {}),
      };
    }
    out[loc] = fields;
  }
  return out;
}

export function fieldStatus(
  english: string | null | undefined,
  translated: string | null | undefined,
  meta: FieldMeta | undefined
): FieldStatus {
  if (!english || !english.trim()) return "na";
  if (!translated || !translated.trim()) return "missing";
  if (meta?.review) return "review";
  if (meta?.src && meta.src !== sourceHash(english)) return "stale";
  return "ok";
}

/**
 * The meta to store after a save. A translation that CHANGED (or is newly
 * written) by a person is recorded against the English as it is now and
 * marked reviewed. An untouched translation keeps its old provenance -- that
 * is what lets an English-only edit flag it stale. `review: true` is used for
 * AI drafts; `confirm` marks listed fields reviewed without a text change.
 */
export function nextMeta(opts: {
  english: Record<string, string | null | undefined>;
  before: I18nValues;
  after: I18nValues;
  meta: I18nMeta;
  review?: boolean;
  /** Written by automatic translation (counts as up to date, no review). */
  machine?: boolean;
  confirm?: Array<{ locale: TranslatedLocale; field: string }>;
}): I18nMeta {
  const out: I18nMeta = JSON.parse(JSON.stringify(opts.meta ?? {}));
  for (const loc of TRANSLATED_LOCALES) {
    const after = opts.after[loc] ?? {};
    const before = opts.before[loc] ?? {};
    for (const field of Object.keys(opts.english)) {
      const now = (after[field] ?? "").trim();
      const was = (before[field] ?? "").trim();
      if (!now) {
        if (out[loc]) delete out[loc]![field];
        continue;
      }
      if (now !== was) {
        out[loc] = {
          ...(out[loc] ?? {}),
          [field]: { src: sourceHash(opts.english[field] ?? ""), review: Boolean(opts.review), ...(opts.machine ? { machine: true } : {}) },
        };
      }
    }
  }
  for (const c of opts.confirm ?? []) {
    out[c.locale] = { ...(out[c.locale] ?? {}), [c.field]: { src: sourceHash(opts.english[c.field] ?? ""), review: false } };
  }
  for (const loc of TRANSLATED_LOCALES) if (out[loc] && Object.keys(out[loc]!).length === 0) delete out[loc];
  return out;
}

/** Counts for the coverage dashboard. */
export function tally(statuses: FieldStatus[]) {
  const t = { ok: 0, missing: 0, stale: 0, review: 0, total: 0 };
  for (const s of statuses) {
    if (s === "na") continue;
    t.total++;
    t[s]++;
  }
  return { ...t, percent: t.total ? Math.round((t.ok / t.total) * 100) : 100 };
}
