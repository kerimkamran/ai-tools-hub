import type { Tool } from "./types";

/**
 * Azerbaijani letters that Unicode normalisation does NOT fold.
 *
 * NFKD decomposes a letter into a base plus combining marks, so stripping the
 * marks handles ü -> u, ö -> o, ç -> c, ş -> s, ğ -> g. But these are distinct
 * letters rather than decorated ones, and NFKD leaves them untouched:
 *
 *   ə  U+0259  LATIN SMALL LETTER SCHWA
 *   ı  U+0131  LATIN SMALL LETTER DOTLESS I
 *
 * Without this map, typing "azerbaycan" would not find "Azərbaycan" -- which
 * matters, because the audience for these tools types it both ways.
 */
const EXTRA_FOLDS: Record<string, string> = {
  "ə": "e", // ə schwa
  "ı": "i", // ı dotless i
  "ǝ": "e", // ǝ turned e
};

/**
 * Lowercase, fold the letters above, strip diacritics, collapse whitespace.
 */
export function normalize(s: string): string {
  let folded = "";
  for (const ch of s.toLowerCase()) folded += EXTRA_FOLDS[ch] ?? ch;
  return folded
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** One pre-normalised haystack per tool: name + tagline + category (both the
 *  English key and the localized label) + tags. */
export function haystack(tool: Tool): string {
  return normalize(
    [tool.name, tool.tagline, tool.category, tool.categoryLabel ?? "", ...tool.tags].join(" ")
  );
}

/**
 * Multi-word queries AND together rather than matching as a phrase, so
 * "hr assess" finds a tool categorised HR whose tagline mentions assessment.
 */
export function matches(hay: string, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  return q.split(" ").every((term) => hay.includes(term));
}

export function filterTools(
  tools: Tool[],
  query: string,
  category: string | null
): Tool[] {
  const q = normalize(query);
  return tools.filter((t) => {
    if (category && t.category !== category) return false;
    if (!q) return true;
    return matches(haystack(t), q);
  });
}

/** Categories actually present in the data -- never a hardcoded list that can
 *  drift away from what is published. */
export function categoriesOf(tools: Tool[]): string[] {
  return Array.from(new Set(tools.map((t) => t.category).filter(Boolean))).sort(
    (a, b) => a.localeCompare(b)
  );
}
