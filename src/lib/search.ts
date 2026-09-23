import type { Tool } from "./types";

/**
 * Lowercase, strip diacritics, collapse whitespace.
 *
 * NFKD + combining-mark removal means "Azerbaijan" matches "Azərbaycan"-style
 * input, which matters for an AZ/RU/EN audience even while the UI is English.
 */
export function normalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** One pre-normalised haystack per tool: name + tagline + category + tags. */
export function haystack(tool: Tool): string {
  return normalize(
    [tool.name, tool.tagline, tool.category, ...tool.tags].join(" ")
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

/** Categories actually present in the data -- never a hardcoded list that
 *  can drift away from what is published. */
export function categoriesOf(tools: Tool[]): string[] {
  return Array.from(new Set(tools.map((t) => t.category).filter(Boolean))).sort(
    (a, b) => a.localeCompare(b)
  );
}
