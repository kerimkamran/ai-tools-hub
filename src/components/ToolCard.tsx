import Link from "next/link";
import { displayHost, type Tool } from "@/lib/types";
import { strings } from "@/lib/strings";
import { AccessBadge, PlannedBadge } from "./AccessBadge";
import { HealthDot } from "./HealthDot";

const CARD_BASE =
  "group relative flex h-full flex-col gap-3 rounded-lg border p-4 transition-[border-color,box-shadow] duration-150";

function Body({ tool }: { tool: Tool }) {
  const host = displayHost(tool.url);
  const planned = tool.status === "planned";

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <span aria-hidden="true" className="text-[26px] leading-none">
          {tool.icon}
        </span>
        {!planned && (
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="mt-1 h-3.5 w-3.5 shrink-0 opacity-40 transition-opacity group-hover:opacity-80"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 2h8v8M14 2 6.5 9.5M11 10.5V14H2V5h3.5" />
          </svg>
        )}
      </div>

      <div className="flex-1">
        <h3 className="text-base font-semibold leading-tight">{tool.name}</h3>
        <p className="mt-1.5 line-clamp-2 text-sm leading-snug" style={{ color: "var(--muted)" }}>
          {tool.tagline}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs" style={{ color: "var(--faint)" }}>
          {tool.category}
        </span>
        <span aria-hidden="true" style={{ color: "var(--line-strong)" }}>
          ·
        </span>
        {planned ? <PlannedBadge label={strings.comingSoon} /> : <AccessBadge access={tool.access} />}
      </div>

      {tool.accessNote && (
        <p className="text-xs leading-snug" style={{ color: "var(--muted)" }}>
          {tool.accessNote}
        </p>
      )}

      {/* Reserved row: host + health. Fixed height so the async health badge
          cannot cause layout shift when it resolves. */}
      <div className="flex h-4 items-center justify-between gap-2">
        <span className="truncate text-[11px]" style={{ color: "var(--faint)" }}>
          {planned ? "" : host}
        </span>
        {!planned && tool.healthUrl && <HealthDot toolId={tool.id} />}
      </div>
    </>
  );
}

export function ToolCard({ tool }: { tool: Tool }) {
  const planned = tool.status === "planned" || !tool.url;

  if (planned) {
    return (
      <div
        aria-disabled="true"
        className={`${CARD_BASE} opacity-60`}
        style={{ borderColor: "var(--line)", background: "var(--surface)" }}
      >
        <Body tool={tool} />
      </div>
    );
  }

  return (
    <a
      href={tool.url}
      target="_blank"
      rel="noopener"
      aria-label={`${strings.openTool(tool.name)} — ${tool.tagline} (${strings.opensInNewTab})`}
      className={`${CARD_BASE} hover:shadow-[var(--shadow-sm)]`}
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
      data-tool-card
    >
      <Body tool={tool} />
    </a>
  );
}

/**
 * Secondary affordance. The card's primary action goes straight to the tool --
 * one click, no interstitial -- so this exists for deep links, sharing and as
 * the canonical URL crawlers see. It sits OUTSIDE the card anchor because a
 * link inside a link is invalid HTML and breaks keyboard navigation.
 */
export function ToolDetailsLink({ tool }: { tool: Tool }) {
  return (
    <Link
      href={`/tools/${tool.slug}`}
      className="text-xs underline underline-offset-2 hover:opacity-70"
      style={{ color: "var(--muted)" }}
    >
      {strings.details}
      <span className="sr-only"> about {tool.name}</span>
    </Link>
  );
}
