/** Lifecycle of a catalog entry. Only `published` and `planned` are ever
 *  readable by the public (enforced in RLS, not just here). */
export type ToolStatus = "published" | "planned" | "unlisted" | "archived";

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
  createdAt: string;
  updatedAt: string;
};

export const ACCESS_LABEL: Record<ToolAccess, string> = {
  open: "Open",
  "sign-in": "Sign-in required",
  "invite-only": "Invite only",
};

export const STATUS_LABEL: Record<ToolStatus, string> = {
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
  created_at: string;
  updated_at: string;
};

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
    createdAt: r.created_at,
    updatedAt: r.updated_at,
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
