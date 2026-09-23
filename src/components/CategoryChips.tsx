"use client";

import { strings } from "@/lib/strings";

/**
 * Single-select filter. Rendered as toggle buttons with aria-pressed rather
 * than a radiogroup, because each chip is independently operable with Enter
 * or Space and that maps to how people actually use them.
 */
export function CategoryChips({
  categories,
  active,
  onChange,
}: {
  categories: string[];
  active: string | null;
  onChange: (c: string | null) => void;
}) {
  if (categories.length < 2) return null;

  const items: Array<{ key: string; label: string; value: string | null }> = [
    { key: "__all", label: strings.allCategories, value: null },
    ...categories.map((c) => ({ key: c, label: c, value: c })),
  ];

  return (
    <div
      role="group"
      aria-label={strings.categoriesLabel}
      className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0"
    >
      {items.map((item) => {
        const selected = active === item.value;
        return (
          <button
            key={item.key}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(item.value)}
            className="shrink-0 rounded-full border px-3.5 text-sm transition-colors duration-150"
            style={{
              minHeight: 44,
              borderColor: selected ? "var(--foreground)" : "var(--control-border)",
              background: selected ? "var(--foreground)" : "transparent",
              color: selected ? "var(--background)" : "var(--muted)",
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
