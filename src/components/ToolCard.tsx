import Link from "next/link";
import { displayHost, type Tool } from "@/lib/types";
import { getStrings } from "@/lib/strings";
import { localePath, type Locale } from "@/lib/i18n";
import { AccessBadge, PlannedBadge } from "./AccessBadge";
import { HealthDot } from "./HealthDot";
import { ToolIcon } from "./ToolIcon";

const CARD_BASE =
  "group relative flex h-full flex-col gap-3 border transition-[border-color,box-shadow] duration-150";

/** Shape comes from the Design Studio variables (globals.css). */
const CARD_SHAPE = { borderRadius: "var(--radius)", borderWidth: "var(--bw)", padding: "var(--card-pad)" } as const;

function Body({ tool, planned, locale, adminIcons }: { tool: Tool; planned: boolean; locale: Locale; adminIcons?: boolean }) {
  const host = displayHost(tool.url);
  const strings = getStrings(locale);

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <span aria-hidden="true" className="leading-none">
          <ToolIcon tool={tool} size={26} admin={adminIcons} />
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
          {tool.categoryLabel ?? tool.category}
        </span>
        <span aria-hidden="true" style={{ color: "var(--line-strong)" }}>
          ·
        </span>
        {planned ? <PlannedBadge label={strings.comingSoon} /> : <AccessBadge access={tool.access} locale={locale} />}
      </div>

      {tool.maintenance && (
        <p className="text-xs leading-snug" style={{ color: "var(--warning)" }}>
          {tool.maintenance.message}
        </p>
      )}

      {tool.accessNote && (
        <p className="text-xs leading-snug" style={{ color: "var(--muted)" }}>
          {tool.accessNote}
        </p>
      )}

      {/* Reserved row: host + health. Fixed height so the async health badge
          cannot shift layout when it resolves. */}
      <div className="flex h-4 items-center justify-between gap-2">
        <span className="truncate text-[11px]" style={{ color: "var(--faint)" }}>
          {planned ? "" : host}
        </span>
        {tool.maintenance ? (
          <MaintenanceBadge tool={tool} locale={locale} />
        ) : (
          !planned && tool.healthUrl && <HealthDot toolId={tool.id} locale={locale} />
        )}
      </div>
    </>
  );
}

/** Replaces the health dot while a tool is in maintenance (capability 10). */
function MaintenanceBadge({ tool, locale }: { tool: Tool; locale: Locale }) {
  const t = getStrings(locale);
  const until = tool.maintenance?.until
    ? new Date(new Date(tool.maintenance.until).getTime() - 1).toLocaleDateString(locale === "en" ? "en-GB" : locale, { timeZone: "Asia/Baku", day: "numeric", month: "short" })
    : null;
  return (
    <span className="shrink-0 text-[11px] font-medium" style={{ color: "var(--warning)" }}>
      🔧 {t.maintenance}{until ? ` · ${t.maintenanceUntil(until)}` : ""}
    </span>
  );
}

export function ToolCard({ tool, locale, adminIcons = false }: { tool: Tool; locale: Locale; adminIcons?: boolean }) {
  const strings = getStrings(locale);
  const planned = tool.status === "planned" || !tool.url;

  if (planned) {
    return (
      /**
       * Dimmed, but NOT with opacity.
       *
       * `opacity-60` on the whole card multiplied through to the text and
       * dropped it to roughly 2:1 -- well under AA, and the card that most
       * needs to be readable is the one explaining a tool does not exist yet.
       * The muted look now comes from a sunken background and normal-contrast
       * text instead.
       */
      <div
        aria-disabled="true"
        data-card
        className={CARD_BASE}
        style={{ ...CARD_SHAPE, borderColor: "var(--card-border)", background: "var(--surface-sunken)" }}
      >
        <Body tool={tool} planned locale={locale} adminIcons={adminIcons} />
      </div>
    );
  }

  /**
   * The accessible name is built explicitly, because aria-label REPLACES the
   * element's inner text for assistive tech. The first version named only the
   * tool and its tagline, which silently hid the access badge and the access
   * note -- and the access note is the single most important thing on the
   * card, since it is what tells someone they cannot get in at all.
   */
  const label = [
    strings.openTool(tool.name),
    tool.tagline,
    strings.access[tool.access],
    tool.accessNote,
    strings.onHost(displayHost(tool.url)),
    `(${strings.opensInNewTab})`,
  ]
    .filter(Boolean)
    // Trim any trailing period before joining: taglines are written as
    // sentences, and a screen reader voices ".." as an awkward extra pause.
    .map((part) => {
      const text = String(part).trimEnd();
      return text.endsWith(".") ? text.slice(0, -1) : text;
    })
    .join(". ");

  return (
    <a
      href={tool.url}
      target="_blank"
      rel="noopener"
      aria-label={label}
      className={CARD_BASE}
      style={{ ...CARD_SHAPE, borderColor: "var(--card-border)", background: "var(--surface)" }}
      data-tool-card
      data-card
      data-tool-open={tool.id}
    >
      <Body tool={tool} planned={false} locale={locale} adminIcons={adminIcons} />
    </a>
  );
}

/**
 * Secondary affordance. The card's primary action goes straight to the tool --
 * one click, no interstitial -- so this exists for deep links, sharing, and as
 * the canonical URL crawlers see. It sits OUTSIDE the card anchor because a
 * link inside a link is invalid HTML and breaks keyboard navigation.
 */
export function ToolDetailsLink({ tool, locale }: { tool: Tool; locale: Locale }) {
  const strings = getStrings(locale);
  return (
    <Link
      href={localePath(locale, `/tools/${tool.slug}`)}
      className="text-xs underline underline-offset-2 hover:opacity-70"
      style={{ color: "var(--muted)" }}
    >
      {strings.details}
      <span className="sr-only">{strings.detailsAbout(tool.name)}</span>
    </Link>
  );
}
