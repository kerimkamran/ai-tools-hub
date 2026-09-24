/**
 * The build gate for capability 2 (Roles & Permissions).
 *
 * Static check: every exported function in a "use server" file must call
 * requirePermission() unless it is on the explicit public allowlist
 * (PUBLIC_SERVER_ACTIONS). Every admin page and admin route handler must
 * call requirePermission() too, except the pages a person uses to GET a
 * session. A Server Action added later without a check fails `npm test`,
 * and `npm run build` runs `npm test` first -- so it cannot be deployed.
 *
 * Plus the permission map's own rules.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLIC_SERVER_ACTIONS, can, PERMISSIONS } from "../src/lib/permissions.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");

let fails = 0;
const check = (name: string, ok: boolean) => {
  if (!ok) fails++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}`);
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f));
const allow = new Set<string>(PUBLIC_SERVER_ACTIONS);

// --- Server Actions ------------------------------------------------------------
let actionCount = 0;
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const firstCode = text.replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, "");
  if (!/^["']use server["']/.test(firstCode)) continue;
  const re = /export\s+async\s+function\s+(\w+)\s*\(/g;
  const starts: Array<{ name: string; index: number }> = [];
  for (let m; (m = re.exec(text)); ) starts.push({ name: m[1], index: m.index });
  starts.forEach((s, i) => {
    actionCount++;
    const body = text.slice(s.index, i + 1 < starts.length ? starts[i + 1].index : text.length);
    const ok = allow.has(s.name) || /requirePermission\s*\(/.test(body);
    check(`${relative(ROOT, file)} :: ${s.name}${allow.has(s.name) ? " (public allowlist)" : ""}`, ok);
  });
  // A non-async exported function in a "use server" file would be a build
  // error anyway; an exported const arrow function would dodge this scan.
  check(`${relative(ROOT, file)} has no exported const actions`, !/export\s+const\s+\w+\s*=\s*async/.test(text));
}
check(`found server actions to check (${actionCount})`, actionCount >= 20);

// --- Admin pages and route handlers ----------------------------------------------
const OPEN_PAGES = new Set([
  "src/app/admin/login/page.tsx",
  "src/app/admin/login/mfa/page.tsx",
  "src/app/admin/invite/[token]/page.tsx",
  "src/app/admin/team/page.tsx", // redirect only
]);
for (const file of files) {
  const rel = relative(ROOT, file).split("\\").join("/");
  if (!rel.startsWith("src/app/admin/")) continue;
  if (!/\/(page\.tsx|route\.ts)$/.test(rel)) continue;
  if (OPEN_PAGES.has(rel)) continue;
  check(`${rel} calls requirePermission()`, /requirePermission\s*\(/.test(readFileSync(file, "utf8")));
}

// --- The map itself ---------------------------------------------------------------
check("staff cannot enter any admin capability", !Object.keys(PERMISSIONS).some((p) => p !== "assistant.use" && can("staff", p as keyof typeof PERMISSIONS)));
check("editor cannot publish", !can("editor", "catalog.edit") && !can("editor", "kb.edit"));
check("editor can draft", can("editor", "catalog.draft") && can("editor", "kb.draft"));
check("admin cannot manage roles, security, audit, AI or theme",
  !can("admin", "accounts.manage") && !can("admin", "security.manage") && !can("admin", "audit.view") &&
  !can("admin", "ai.manage") && !can("admin", "theme.manage"));
check("admin can manage staff accounts", can("admin", "accounts.staff"));
check("super can do everything", Object.keys(PERMISSIONS).every((p) => can("super", p as keyof typeof PERMISSIONS)));
check("no role -> nothing", !can(null, "catalog.view"));
check("editor sees translations but cannot translate published content",
  can("editor", "translations.view") && !can("editor", "translations.edit"));
check("only super admins see stored conversation text", can("super", "insights.view") && !can("admin", "insights.view") && !can("editor", "insights.view"));
check("admin translates but not the tagline", can("admin", "translations.edit") && !can("admin", "tagline.edit"));

// --- Public routes stay static (Engineering rules) --------------------------------
for (const file of files) {
  const rel = relative(ROOT, file).split("\\").join("/");
  if (!rel.startsWith("src/app/[locale]/") || !rel.endsWith("/page.tsx")) continue;
  if (rel.includes("/assistant")) continue; // signed-in pages, dynamic by design
  const text = readFileSync(file, "utf8");
  check(`${rel} is ISR (revalidate = 60)`, /export\s+const\s+revalidate\s*=\s*60\b/.test(text));
  check(`${rel} reads no cookies`, !/from\s+["']next\/headers["']/.test(text));
}

console.log(fails === 0 ? "ALL PASS" : `${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
