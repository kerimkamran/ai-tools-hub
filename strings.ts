/**
 * Every user-visible string in one place.
 *
 * The hub is English-only in MVP, but the CV Screener will need AZ/RU/EN, so
 * keeping copy here makes adding locales a mechanical change rather than a
 * refactor of every component.
 */
export const strings = {
  brand: "One.Simple",
  tagline: "Everything I've built, in one place.",
  searchPlaceholder: "Search tools…",
  searchLabel: "Search AI tools",
  categoriesLabel: "Filter by category",
  allCategories: "All",
  clear: "Clear",
  noToolsYet: "No tools published yet.",
  noMatch: (q: string) => `No tools match “${q}”.`,
  resultCount: (n: number) => (n === 1 ? "1 tool" : `${n} tools`),
  opensInNewTab: "opens in new tab",
  details: "Details",
  planned: "Planned",
  comingSoon: "Coming soon",
  waking: "Waking up…",
  live: "Live",
  backToHub: "← All tools",
  about: "About",
  openTool: (name: string) => `Open ${name}`,
  themeToLight: "Switch to light theme",
  themeToDark: "Switch to dark theme",
} as const;
