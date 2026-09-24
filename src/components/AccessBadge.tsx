import type { ToolAccess } from "@/lib/types";
import { getStrings } from "@/lib/strings";
import type { Locale } from "@/lib/i18n";

/**
  * Tells the visitor what they will meet BEFORE they click.
 *
 * The border uses --line-strong rather than --control-border because this is
 * NOT an interactive control: the badge text carries the meaning, so WCAG
 * 1.4.11 does not apply to its outline. Its text colour does meet 4.5:1.
 *
 * This is not decoration. For a tool with a domain allowlist, a stranger
 * cannot get in at all, and discovering that after a page load, a cold start
 * and a failed signup is the worst outcome this product can produce.
 */
export function AccessBadge({ access, locale }: { access: ToolAccess; locale: Locale }) {
  const open = access === "open";
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] leading-4 font-medium"
      style={{
        borderColor: "var(--line-strong)",
        color: open ? "var(--good)" : "var(--muted)",
      }}
    >
      {getStrings(locale).access[access]}
    </span>
  );
}

export function PlannedBadge({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full border border-dashed px-2 py-0.5 text-[11px] leading-4 font-medium"
      style={{ borderColor: "var(--line-strong)", color: "var(--faint)" }}
    >
      {label}
    </span>
  );
}
