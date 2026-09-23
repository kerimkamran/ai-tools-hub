import type { Tool } from "@/lib/types";
import { ToolCard, ToolDetailsLink } from "./ToolCard";

/**
 * Fluid grid: 1 column on phones, 2 on tablets, 3 on desktop, sized by
 * auto-fill rather than fixed breakpoints so it degrades smoothly in between.
 */
export function ToolGrid({ tools }: { tools: Tool[] }) {
  return (
    <ul
      className="grid list-none gap-4 p-0"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))" }}
    >
      {tools.map((tool) => (
        <li key={tool.id} className="flex flex-col gap-1.5">
          <ToolCard tool={tool} />
          <div className="pl-1">
            <ToolDetailsLink tool={tool} />
          </div>
        </li>
      ))}
    </ul>
  );
}
