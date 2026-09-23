/**
 * Regression test for the WCAG contrast math the theme editor's save gate
 * depends on (Phase B). This is the one control standing between a bad
 * admin-entered palette and a genuine accessibility regression on a live,
 * indexed site -- getting the maths wrong here would make the gate either
 * block everything or block nothing.
 *
 * Tests src/lib/contrast.ts directly -- the pure, dependency-free maths.
 * src/lib/theme-validate.ts (the actual gate used by the Server Action) is a
 * thin data-shape wrapper around these same functions, imported with the
 * "@/" alias Next.js resolves but this plain `node` runner does not; it is
 * exercised instead by `npm run build` and `tsc --noEmit`, same as the rest
 * of the app. The behavioural cases below (shipped palette passes, a
 * near-invisible token fails) are reproduced here against contrast.ts
 * directly so the exact iteration theme-validate.ts does -- every
 * text-role token against both structural surfaces -- still gets covered.
 *
 *   npm run test:contrast
 */
import { contrastRatio, isValidHex, roundRatio, TEXT_CONTRAST_FLOOR } from "../src/lib/contrast.ts";

let fails = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (!ok) fails++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${ok ? "" : detail ? `  <-- ${detail}` : ""}`);
}

console.log("--- known ratios ---");
check("black/white is 21:1", roundRatio(contrastRatio("#000000", "#ffffff")) === 21);
check("a colour against itself is 1:1", roundRatio(contrastRatio("#356d1b", "#356d1b")) === 1);
check(
  "order does not matter",
  roundRatio(contrastRatio("#15263f", "#ffffff")) === roundRatio(contrastRatio("#ffffff", "#15263f"))
);
check("hex is case-insensitive", contrastRatio("#0F3C76", "#FFFFFF") === contrastRatio("#0f3c76", "#ffffff"));

console.log("--- isValidHex ---");
check("#0f3c76 is valid", isValidHex("#0f3c76"));
check("#0F3C76 is valid (uppercase)", isValidHex("#0F3C76"));
check("0f3c76 without # is invalid", !isValidHex("0f3c76"));
check("#0f3c7 (5 digits) is invalid", !isValidHex("#0f3c7"));
check("#0f3c766 (7 digits) is invalid", !isValidHex("#0f3c766"));
check("named colour is invalid", !isValidHex("blue"));
check("rgb() is invalid", !isValidHex("rgb(15, 60, 118)"));
check(
  "script-bearing string is invalid",
  !isValidHex("#000</style><script>alert(1)</script>")
);

console.log("--- Phase A globals.css numbers (header comment), re-verified here ---");
// Structural tokens are not admin-editable and live in globals.css, not in
// site_settings -- duplicated here on purpose, the same "measured twice"
// discipline the SSRF validator uses.
const INK = "#15263f";
const MUTED = "#5b6779";
const FAINT = "#4d5a6d";
const CONTROL_BORDER = "#6f8aad";
const PAPER = "#ffffff";
const CANVAS = "#e7eef8";
const DARK_SURFACE = "#171717";
const DARK_BACKGROUND = "#111111";

check("ink/paper >= 15.2:1", roundRatio(contrastRatio(INK, PAPER)) >= 15.2);
check("ink/canvas >= 13.0:1", roundRatio(contrastRatio(INK, CANVAS)) >= 13.0);
check("muted/paper >= 4.5:1 (WCAG floor)", contrastRatio(MUTED, PAPER) >= 4.5);
check("muted/canvas >= 4.5:1 (WCAG floor)", contrastRatio(MUTED, CANVAS) >= 4.5);
check("faint/paper >= 4.5:1 (WCAG floor)", contrastRatio(FAINT, PAPER) >= 4.5);
check("faint/canvas >= 4.5:1 (WCAG floor)", contrastRatio(FAINT, CANVAS) >= 4.5);
check("control-border/paper >= 3:1 (WCAG 1.4.11 floor)", contrastRatio(CONTROL_BORDER, PAPER) >= 3);

console.log("--- theme editor's contrast gate, reproduced against the shipped palette ---");
// The exact palette src/lib/settings.ts's DEFAULT_SITE_SETTINGS and the
// 0004_site_settings.sql seed both ship. TEXT_TOKENS in theme-validate.ts
// excludes logoBlue (gradient-only, never rendered as text) -- reproduced
// here as the same six keys.
const SHIPPED_PALETTE = {
  light: {
    primary: "#0f3c76",
    navy: "#092649",
    leaf: "#356d1b",
    good: "#387047",
    warning: "#96532b",
    critical: "#b23b3b",
  },
  dark: {
    primary: "#879eba",
    navy: "#f0f0f0",
    leaf: "#9ab68d",
    good: "#92b09a",
    warning: "#c5a08a",
    critical: "#d59393",
  },
};
const SURFACES = {
  light: { surface: PAPER, background: CANVAS },
  dark: { surface: DARK_SURFACE, background: DARK_BACKGROUND },
};

type Failure = { mode: "light" | "dark"; token: string; against: "surface" | "background"; ratio: number };

function gate(palette: typeof SHIPPED_PALETTE): Failure[] {
  const failures: Failure[] = [];
  for (const mode of ["light", "dark"] as const) {
    const colors = palette[mode];
    const surfaces = SURFACES[mode];
    for (const token of Object.keys(colors) as (keyof typeof colors)[]) {
      for (const against of ["surface", "background"] as const) {
        const ratio = contrastRatio(colors[token], surfaces[against]);
        if (ratio < TEXT_CONTRAST_FLOOR) {
          failures.push({ mode, token, against, ratio: roundRatio(ratio) });
        }
      }
    }
  }
  return failures;
}

const seededFailures = gate(SHIPPED_PALETTE);
check(
  "the shipped default palette (Phase A's own tokens) clears the gate with zero failures",
  seededFailures.length === 0,
  `${seededFailures.length} failure(s): ${JSON.stringify(seededFailures)}`
);

const badPalette = {
  light: { ...SHIPPED_PALETTE.light, primary: "#dde5f0" }, // near-white on white -- must fail
  dark: SHIPPED_PALETTE.dark,
};
const badFailures = gate(badPalette);
check(
  "a near-invisible colour is caught by the gate",
  badFailures.some((f) => f.mode === "light" && f.token === "primary"),
  JSON.stringify(badFailures)
);

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
