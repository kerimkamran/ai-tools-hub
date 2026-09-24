/**
 * The curated icon set for catalog entries (client-safe). Glyphs and emoji
 * render everywhere with no image request; a tool can instead upload its own
 * raster logo (served by /tool-icon/<id>).
 */
export const TOOL_ICONS: Array<{ glyph: string; label: string }> = [
  { glyph: "◈", label: "Diamond" }, { glyph: "✦", label: "Spark" }, { glyph: "◰", label: "Panel" },
  { glyph: "⬡", label: "Hexagon" }, { glyph: "◎", label: "Target ring" }, { glyph: "❖", label: "Ornament" },
  { glyph: "▣", label: "Square" }, { glyph: "⌘", label: "Command" }, { glyph: "✎", label: "Pencil" },
  { glyph: "🤖", label: "Robot" }, { glyph: "🧠", label: "Brain" }, { glyph: "💡", label: "Idea" },
  { glyph: "🔍", label: "Search" }, { glyph: "📝", label: "Notes" }, { glyph: "📄", label: "Document" },
  { glyph: "🗂️", label: "Folders" }, { glyph: "💬", label: "Chat" }, { glyph: "📊", label: "Chart" },
  { glyph: "📈", label: "Growth" }, { glyph: "🎯", label: "Goal" }, { glyph: "🧩", label: "Puzzle" },
  { glyph: "⚡", label: "Fast" }, { glyph: "🛡️", label: "Shield" }, { glyph: "👥", label: "People" },
  { glyph: "🧾", label: "Receipt" }, { glyph: "🗓️", label: "Calendar" }, { glyph: "🎓", label: "Learning" },
  { glyph: "📣", label: "Announce" }, { glyph: "🧪", label: "Experiment" }, { glyph: "⚙️", label: "Settings" },
  { glyph: "📦", label: "Package" }, { glyph: "🌐", label: "Web" },
];

export const TOOL_ICON_MAX_BYTES = 128 * 1024;
