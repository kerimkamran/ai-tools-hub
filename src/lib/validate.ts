import { z } from "zod";

/**
 * URL safety.
 *
 * The admin UI lets a human type a URL that the SERVER later fetches
 * (/api/health). That makes healthUrl an SSRF surface: if the admin account
 * were ever compromised, it becomes a probe into anything the serverless
 * function can reach -- including cloud metadata endpoints.
 *
 * These checks run on WRITE (so bad values never enter the database) and
 * again on READ (so rows written by any other path are still refused).
 * Defence in depth, because the cost of being wrong here is high and the
 * cost of checking twice is nil.
 *
 * Caveat worth stating plainly: this is hostname-based, so it cannot stop a
 * DNS name that resolves to a private address (DNS rebinding). Node's fetch
 * gives no supported hook to pin the resolved IP, so the remaining controls
 * matter -- redirect: "manual", a short timeout, the body never being read,
 * and only ever fetching URLs already stored in the registry.
 */

const PRIVATE_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /\.localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^169\.254\./, // link-local, incl. 169.254.169.254 cloud metadata
  /^::1$/,
  /^\[?::1\]?$/,
  /^f[cd][0-9a-f]{2}:/i, // fc00::/7 unique-local
  /^fe80:/i, // link-local v6
  /\.internal$/i,
  /\.local$/i,
];

/** Bare IP literals are rejected outright: a legitimate tool has a hostname. */
const IPV4_LITERAL = /^\d{1,3}(\.\d{1,3}){3}$/;

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

export function checkPublicHttpsUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "Not a valid absolute URL." };
  }

  if (url.protocol !== "https:") {
    return { ok: false, reason: "Must use https://." };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "URLs with embedded credentials are not allowed." };
  }

  // Strip a trailing dot before matching. "localhost." and
  // "box.internal." are the same hosts to a resolver but would sail
  // past patterns anchored with $.
  const hostRaw = url.hostname.toLowerCase();
  const host = hostRaw.endsWith(".") ? hostRaw.slice(0, -1) : hostRaw;

  if (IPV4_LITERAL.test(host) || host.startsWith("[")) {
    return { ok: false, reason: "IP addresses are not allowed; use a hostname." };
  }
  if (PRIVATE_HOST_PATTERNS.some((re) => re.test(host))) {
    return { ok: false, reason: "Private, loopback and link-local hosts are not allowed." };
  }
  if (!host.includes(".")) {
    return { ok: false, reason: "Hostname must be fully qualified." };
  }

  return { ok: true, url };
}

// Exported: reused for any other admin-editable link that a person clicks
// (not one the server fetches), e.g. the careers/apply link on the home
// page's Graham Bell panel -- same "no javascript:, no garbage" discipline.
export const safeUrl = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((v) => checkPublicHttpsUrl(v).ok, {
    message: "Must be a public https:// URL with a real hostname.",
  });

/** Slug must be URL-safe and must not collide with a hub route. */
const RESERVED_SLUGS = new Set([
  "admin", "api", "about", "tools", "go", "_next", "static",
  "robots", "sitemap", "login", "favicon",
]);

export const toolInputSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, digits and hyphens only."),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, digits and hyphens only.")
    .refine((v) => !RESERVED_SLUGS.has(v), {
      message: "That slug is reserved by the hub.",
    }),
  name: z.string().trim().min(1).max(60),
  tagline: z.string().trim().min(1).max(80),
  description: z.string().trim().max(2000).default(""),
  category: z.string().trim().min(1).max(40),
  tags: z.array(z.string().trim().min(1).max(30)).max(12).default([]),
  icon: z.string().trim().max(200).default(""),
  // Optional here, because a `planned` tool legitimately has no URL yet.
  // "Published implies a URL" is enforced in saveTool AND by a CHECK
  // constraint in the migration -- making it mandatory in the schema would
  // make it impossible to save a coming-soon card at all.
  url: z.union([safeUrl, z.literal("")]).default(""),
  healthUrl: safeUrl.nullable().default(null),
  access: z.enum(["open", "sign-in", "invite-only"]),
  accessNote: z.string().trim().max(120).nullable().default(null),
  status: z.enum(["draft", "published", "planned", "unlisted", "archived"]),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export type ToolInput = z.infer<typeof toolInputSchema>;

/**
 * AZ/RU translations of a tool (Phase C). Every field optional -- blank means
 * "fall back to English", never "render blank". Same length caps as the
 * English base columns so a translation cannot break the card layout that
 * the English value was sized for.
 */
const optionalText = (max: number) => z.string().trim().max(max).default("");
const toolTranslationSchema = z.object({
  name: optionalText(60),
  tagline: optionalText(80),
  description: optionalText(2000),
  accessNote: optionalText(120),
});
export const toolI18nSchema = z.object({
  az: toolTranslationSchema,
  ru: toolTranslationSchema,
});
export type ToolI18nInput = z.infer<typeof toolI18nSchema>;

/** Drops blank fields and empty locales before the value is stored. */
export function compactI18n(input: ToolI18nInput): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const [loc, fields] of Object.entries(input)) {
    const kept = Object.fromEntries(Object.entries(fields).filter(([, v]) => v.length > 0));
    if (Object.keys(kept).length) out[loc] = kept;
  }
  return out;
}

/** Parses the comma-separated tags field from the admin form. */
export function parseTags(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);
}

/** Empty string from a form input means "not set", not "empty string". */
export function emptyToNull(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}
