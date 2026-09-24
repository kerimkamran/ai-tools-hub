/**
 * Phase 4 gate (Design Studio): every preset passes the contrast gate, a
 * failing palette is caught, and nothing but validated values reaches CSS.
 */
import { gate, lookCss, PRESETS, sanitizeLook, DEFAULT_LOOK, secondaryTokens, DEFAULT_PALETTE } from "@/lib/design";

let fails = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  if (!ok) fails++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || extra === undefined ? "" : " " + JSON.stringify(extra)}`);
};

for (const p of PRESETS) check(`preset "${p.label}" passes the contrast gate`, gate(p.look).length === 0, gate(p.look));
check("default secondary tokens are globals.css's", secondaryTokens("light", DEFAULT_PALETTE.light).muted === "#5b6779");

const bad = sanitizeLook({ ...DEFAULT_LOOK, light: { ...DEFAULT_LOOK.light, text: "#b0b0b0" } });
check("a low-contrast text colour fails the gate", gate(bad).some((f) => f.what === "Text" && f.mode === "light"));
const badBorder = sanitizeLook({ ...DEFAULT_LOOK, dark: { ...DEFAULT_LOOK.dark, border: "#222222" } });
check("a weak control border fails the gate", gate(badBorder).some((f) => f.what === "Control border"));

const evil = sanitizeLook({
  light: { primary: "red;} body{display:none", text: "#000" },
  design: { font: "comic;}", radius: 999, card: "<script>", background: "url(x)", accentRule: "yes" },
});
check("invalid hex falls back", evil.light.primary === DEFAULT_LOOK.light.primary && evil.light.text === DEFAULT_LOOK.light.text);
check("unknown design values fall back", evil.design.font === "manrope" && evil.design.radius === 8 && evil.design.card === "outlined" && evil.design.background === "solid" && evil.design.accentRule === true);
const css = lookCss(evil);
check("CSS contains no injected text", !/display:none|script|url\(|comic/.test(css));
check("CSS is only custom properties", css.replace(/:root(\.dark)?\{[^}]*\}/g, "") === "");

console.log(fails === 0 ? "ALL PASS" : `${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
