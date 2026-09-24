import type { Tool } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { ToolCard, ToolDetailsLink } from "./ToolCard";

/**
 * Fluid grid: 1 column on phones, 2 on tablets, 3 on desktop, sized by
 * auto-fill rather than fixed breakpoints so it degrades smoothly between them.
 *
 * role="list" is explicit because `list-style: none` makes Safari/VoiceOver
 * drop list semantics entirely, which would cost screen-reader users the
 * "list of N items" announcement and item positions.
 */
export function ToolGrid({ tools, locale }: { tools: Tool[]; locale: Locale }) {
  return (
    <ul
      role="list"
      className="grid list-none p-0"
      style={{ gap: "var(--grid-gap)", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))" }}
    >
      {tools.map((tool) => (
        <li key={tool.id} className="flex flex-col gap-1.5">
          <ToolCard tool={tool} locale={locale} />
          <div className="pl-1">
            <ToolDetailsLink tool={tool} locale={locale} />
          </div>
        </li>
      ))}
    </ul>
  );
}
