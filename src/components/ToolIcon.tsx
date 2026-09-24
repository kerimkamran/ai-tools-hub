import type { Tool } from "@/lib/types";

/**
 * A tool's icon: its uploaded logo when there is one, else its glyph.
 * `admin` uses the signed-in route, so drafts' logos show in the panel.
 */
export function ToolIcon({ tool, size, admin = false }: { tool: Pick<Tool, "id" | "icon" | "hasIconImage" | "iconVersion">; size: number; admin?: boolean }) {
  if (tool.hasIconImage) {
    const src = `${admin ? `/admin/tools/${tool.id}/icon` : `/tool-icon/${tool.id}`}?v=${tool.iconVersion}`;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async"
        style={{ width: size, height: size, objectFit: "contain", borderRadius: "calc(var(--radius) / 2)" }} />
    );
  }
  return <span aria-hidden="true" style={{ fontSize: size, lineHeight: 1 }}>{tool.icon}</span>;
}
