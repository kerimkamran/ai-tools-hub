import { pickLocalized, sanitizeI18n, type I18nMap, type Locale } from "./i18n";

/** Tool fields that carry per-locale translations (Phase C). */
export const TOOL_I18N_KEYS = ["name", "tagline", "description", "accessNote"] as const;
export type ToolI18nKey = (typeof TOOL_I18N_KEYS)[number];

/** Lifecycle of a catalog entry. Only `published` and `planned` are ever
 *  listed publicly (enforced in the registry's SQL, not just here). */
export type ToolStatus = "draft" | "published" | "planned" | "unlisted" | "archived";

/** What a visitor will meet when they click. Shown on the card BEFORE the
 *  click, because discovering "you cannot get in" after a page load and a
 *  cold start is the worst outcome in this product. */
export type ToolAccess = "open" | "sign-in" | "invite-only";

/** Result of a health probe. `unknown` renders as no dot at all -- absence of
 *  signal is never rendered as a negative signal. */
export type ToolHealth = "up" | "slow" | "unknown";

export type Tool = {
  id: string;
  slug: string;
  name: string;
  /** Card description. Public writing: no internal codenames or client names. */
  tagline: string;
  /** Detail page body + meta description. */
  description: string;
  category: string;
  /** Searched but never rendered. */
  tags: string[];
  /** Emoji or short inline SVG string. No image pipeline in MVP. */
  icon: string;
  /** Canonical destination. THIS is the one field that changes when tools
   *  later move to subdomains -- which is why it is data, not code. */
  url: string;
  healthUrl: string | null;
  access: ToolAccess;
  accessNote: string | null;
  status: ToolStatus;
  sortOrder: number;
  /** Pinned to the top of the catalog (capability 5). */
  featured: boolean;
  /** An uploaded logo exists (served by /tool-icon/<id>?v=iconVersion). */
  hasIconImage: boolean;
  iconVersion: string;
  /** Maintenance mode (capability 10): active when set and until is in the future. */
  maintenance: { message: string; until: string | null; i18n?: { az?: string; ru?: string } } | null;
  createdAt: string;
  updatedAt: string;
  /** AZ/RU translations of TOOL_I18N_KEYS. English is the base columns above. */
  i18n: I18nMap<ToolI18nKey>;
  /** Display label for `category` in the current locale. Set by localizeTool();
   *  filtering still keys on `category`, which stays the English value. */
  categoryLabel?: string;
  /** Admin-set position of the category (chips are shown in this order). */
  categoryOrder?: number;
};

export const ACCESS_LABEL: Record<ToolAccess, string> = {
  open: "Open",
  "sign-in": "Sign-in required",
  "invite-only": "Invite only",
};

export const STATUS_LABEL: Record<ToolStatus, string> = {
  draft: "Draft",
  published: "Published",
  planned: "Planned",
  unlisted: "Unlisted",
  archived: "Archived",
};

/** Shape returned by the tools table (snake_case) before mapping. */
export type ToolRow = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  tags: string[] | null;
  icon: string;
  url: string;
  health_url: string | null;
  access: ToolAccess;
  access_note: string | null;
  status: ToolStatus;
  sort_order: number;
  featured?: boolean;
  has_icon_image?: boolean;
  icon_version?: string;
  maintenance_message?: string | null;
  maintenance_i18n?: unknown;
  maintenance_until?: string | Date | null;
  created_at: string;
  updated_at: string;
  i18n?: unknown;
};

/**
 * Maintenance is decided at RENDER time (engineering rule 4): public pages
 * revalidate every 60 s, so it switches off by itself shortly after `until`.
 * Localised messages ride in maintenance_i18n ({ az, ru }).
 */
function maintenanceOf(r: ToolRow): Tool["maintenance"] {
  const msg = (r.maintenance_message ?? "").trim();
  if (!msg) return null;
  const until = r.maintenance_until ? new Date(r.maintenance_until) : null;
  if (until && until.getTime() <= Date.now()) return null;
  const raw = (r.maintenance_i18n ?? {}) as Record<string, unknown>;
  const i18n = {
    az: typeof raw.az === "string" && raw.az.trim() ? raw.az.trim() : undefined,
    ru: typeof raw.ru === "string" && raw.ru.trim() ? raw.ru.trim() : undefined,
  };
  return { message: msg, until: until ? until.toISOString() : null, i18n };
}

export function rowToTool(r: ToolRow): Tool {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    tagline: r.tagline,
    description: r.description ?? "",
    category: r.category,
    tags: r.tags ?? [],
    icon: r.icon ?? "",
    url: r.url,
    healthUrl: r.health_url,
    access: r.access,
    accessNote: r.access_note,
    status: r.status,
    sortOrder: r.sort_order,
    featured: Boolean(r.featured),
    hasIconImage: Boolean(r.has_icon_image),
    iconVersion: r.icon_version ?? "",
    maintenance: maintenanceOf(r),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    i18n: sanitizeI18n(r.i18n, TOOL_I18N_KEYS),
  };
}

/** Category label translations and order: { "HR": { az: "İK", ru: "HR", order: 0 } }. */
export type CategoryLabels = Record<string, { az?: string; ru?: string; order?: number }>;

/**
 * The tool as a visitor in `locale` sees it: translated text where it
 * exists, English base values where it does not. Never produces a blank
 * card -- every field falls back to its base column.
 */
export function localizeTool(tool: Tool, locale: Locale, categories: CategoryLabels = {}): Tool {
  // i18n is emptied on the way out: the visitor's page only needs the text
  // in ITS language, and shipping every translation in the page payload
  // would roughly triple it for nothing.
  const categoryOrder = categories[tool.category]?.order;
  const maintenance = tool.maintenance
    ? { message: (locale !== "en" && tool.maintenance.i18n?.[locale]) || tool.maintenance.message, until: tool.maintenance.until }
    : null;
  if (locale === "en") return { ...tool, maintenance, i18n: {}, categoryLabel: tool.category, categoryOrder };
  const accessNote = tool.accessNote
    ? pickLocalized(tool.i18n, locale, "accessNote", tool.accessNote)
    : null;
  const catLabel = categories[tool.category]?.[locale];
  return {
    ...tool,
    name: pickLocalized(tool.i18n, locale, "name", tool.name),
    tagline: pickLocalized(tool.i18n, locale, "tagline", tool.tagline),
    description: pickLocalized(tool.i18n, locale, "description", tool.description),
    accessNote,
    maintenance,
    i18n: {},
    categoryLabel: catLabel && catLabel.trim() ? catLabel : tool.category,
    categoryOrder,
  };
}

/** Host shown in muted text on each card, so the visitor knows they are
 *  leaving before they click. Never throws on a malformed URL. */
export function displayHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}
