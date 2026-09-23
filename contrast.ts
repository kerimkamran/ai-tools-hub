/**
 * WCAG 2.1 relative-luminance / contrast-ratio math, no dependency.
 *
 * Ported directly from the Python script used to derive and verify Phase A's
 * palette (globals.css's header comment has the resulting numbers). Moved
 * into the app itself for Phase B because the theme editor needs to run the
 * exact same check live, in a Server Action, before it will let an admin
 * save a palette -- see src/lib/theme-validate.ts.
 */

const HEX_RE = /^#[0-9a-f]{6}$/i;

export function isValidHex(value: string): boolean {
  return HEX_RE.test(value.trim());
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.trim().match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) throw new Error(`Not a valid 6-digit hex colour: ${hex}`);
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** WCAG contrast ratio between two colours, always >= 1. */
export function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** 4.5:1 -- WCAG 1.4.3, body text against its surface. */
export const TEXT_CONTRAST_FLOOR = 4.5;

/** 3:1 -- WCAG 1.4.11, borders of interactive controls. Unused by the theme
 *  editor today (no editable token maps to a control border), kept here
 *  alongside TEXT_CONTRAST_FLOOR so the two floors stay next to each other
 *  if a future editable token ever needs it. */
export const CONTROL_BORDER_CONTRAST_FLOOR = 3;

export function roundRatio(ratio: number): number {
  return Math.round(ratio * 100) / 100;
}
