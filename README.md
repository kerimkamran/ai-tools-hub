# AI Tools Hub

One public page that lists independently built AI tools, with search, category
filters and cards that open the real applications — in English, Azerbaijani
and Russian (`/en`, `/az`, `/ru`) — plus a staff-only AI assistant that
answers questions about those tools.

The hub is a **directory, not a platform**. Each tool is its own application on
its own host. Nothing is proxied, framed, or served through the hub, and no
session is shared with it. If the hub is down, every tool still works.

---

## Why it links out instead of proxying

Three facts about the real tools, verified against their source and against
production, decided the architecture:

| Fact | Consequence |
|---|---|
| Vantage sends `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'` | Iframe embedding is impossible, not merely unwise |
| Vantage sets no `basePath` | Mounted under a sub-path its `/_next/*` requests would resolve against the hub's build — the page would render, then fail to hydrate |
| The tools are on different hosts and runtimes (Vercel/Next, Render/Express) and each has its own login | There is no single runtime to merge into, and no session to share |

So cards are plain `<a target="_blank" rel="noopener">` links to each tool's
canonical URL. Because the destination is **data** (the `url` column), moving a
tool to a custom subdomain later is one edit in the admin UI — no code change.

## Architecture

```
Public visitor ──► AI Tools Hub (Next.js, Render web service)
  (no account)      static / ISR · no cookies · no middleware on public routes
                         │
        ┌────────────────┼──────────────────┬───────────────────────┐
        │                │                  │                       │
  /{en,az,ru}       /api/health         /admin  (gated)     /{locale}/assistant
  /{locale}/about   cached 30 min       proxy scoped        staff only, dynamic
  /{locale}/tools/*                     HERE only           ──► /api/assistant ──► Claude
        └────────────────┴──────────────────┴───────────────────────┘
                         ▼
              Plain Postgres (Render managed database)
              reached only from server code — never from the browser,
              no public REST endpoint, no third-party backend

    ── plain links ──►  Vantage · SparkLab · (CV Screener, planned)
```

## Invariants

These are load-bearing. Breaking one is a defect, not a preference.

1. **The public catalog is statically rendered and never touches a cookie.**
   Reading cookies or `searchParams` in `src/app/[locale]/page.tsx` would opt
   the route into dynamic rendering and destroy edge-cacheable delivery. The
   `?q=` deep link is therefore read on the client. The same holds for the
   locale: it comes from the URL, never from a cookie or `Accept-Language`.
   After any change, check the build output: `/[locale]`, `/[locale]/about`
   and `/[locale]/tools/[slug]` must stay `●` (SSG).
2. **`src/proxy.ts` matches `/admin` and nothing else.** Widening it puts a
   database round-trip and a session-cookie check in front of the catalog.
3. **The database is unreachable from client code.** `src/lib/db/client.ts`
   imports `server-only` (via files that only ever run on the server), so a
   client import that tried to run a query would fail at build/runtime, not
   silently leak a connection string to the browser. `DATABASE_URL` is never
   exposed via `NEXT_PUBLIC_*`.
4. **The proxy is not the auth boundary.** Every admin page and Server Action
   calls `requireAdmin()` / `getAdminOrNull()` itself, which verifies the
   session cookie's signature and expiry via `verifySessionToken()`
   (`src/lib/session.ts`) rather than trusting that the proxy already checked.
5. **`/api/health` only ever fetches `healthUrl` values already in the
   registry**, re-validated, https-only, private/loopback/IP hosts refused,
   `redirect: "manual"`, body never read.
6. **No route accepts a destination URL from a query parameter.** If click
   tracking is ever added it must be `/go/[toolId]`, resolved server-side.
7. **The page works with JavaScript disabled** — the full grid and every link
   are in the server-rendered HTML.
8. **Adding a tool requires no code change**, only a registry row.
9. **`/admin` requires authorization, not just authentication.** A valid
   session cookie is not sufficient; the email must be in
   `SUPER_ADMIN_EMAILS` **or** an active row in `admin_users` (Phase B).
10. **`unlisted` must not be enumerable.** There is no public database
    endpoint at all — the browser never talks to Postgres directly — but the
    public catalog query still filters to `published`/`planned` explicitly in
    SQL; unlisted rows resolve only server-side, by exact slug.
11. **Super-admin status is never read from a database row.** `admin_users`
    holds only ordinary, invited admins. A super admin who compromised the
    database could not use that access to promote themselves or anyone
    else, because `SUPER_ADMIN_EMAILS` (an env var) is the only source of
    that status — see `src/lib/auth.ts`.
12. **The theme editor cannot save a palette that fails WCAG contrast**, and
    accepts only a fixed token allowlist with strict 6-digit hex — never
    free-form CSS. See `src/lib/theme-validate.ts`.
13. **An untranslated field renders in English, never blank.** Translations
    live in JSONB beside the English base columns; the fallback is
    requested locale → English. See `src/lib/i18n.ts` and its test.
14. **The AI provider key never reaches a browser.** The browser only talks
    to `/api/assistant`; the key is decrypted per request in server code,
    never returned, logged or put in an error message. CSP `connect-src`
    stays `'self'`.
15. **The assistant stops itself.** Session → access → input caps →
    enabled → monthly budget → per-user hourly limit, in that order, before
    any model call. No question or answer text is stored.
16. **Staff are @azerconnect.az only**, enforced in the invite action AND by
    a CHECK constraint on `staff_users`.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in DATABASE_URL, AUTH_SECRET, SUPER_ADMIN_EMAILS
npm run dev
```

### On Render (no terminal needed)

`npm start` runs `scripts/bootstrap.mts` before the web server. On every
start it applies pending migrations, seeds the starter catalog if the tools
table is empty, and gives each `SUPER_ADMIN_EMAILS` address the password in
`INITIAL_ADMIN_PASSWORD` **only if that address has no password yet**. So a
first deploy is: set `DATABASE_URL`, `AUTH_SECRET`, `SUPER_ADMIN_EMAILS` and
`INITIAL_ADMIN_PASSWORD` (12+ characters) in Render → Environment, deploy,
sign in at `/admin`, change your password under your email in the admin nav,
then delete `INITIAL_ADMIN_PASSWORD`. The bootstrap never blocks the site
from starting — if the database is unreachable it logs and the catalog runs
on its static fallback.

The password is an environment variable rather than anything in this
repository on purpose: the repository is public, and a password — or even
its hash — committed here would be readable by anyone.

### By hand

Against that database:

1. Run the migrations **in order** — `npm run migrate` (tracks what's
   already applied in a `_migrations` table, safe to re-run).
2. Seed the starter catalog rows: `psql "$DATABASE_URL" -f db/seed.sql`
   (optional — skip it to start with an empty catalog).
3. Create your first super admin's password:
   `npm run create-super-admin -- you@example.com` — prompts for a password
   (min 12 characters, typed twice, masked on a real terminal) and stores its
   bcrypt hash in `admin_credentials`. There is no signup route in this app,
   on purpose, and this script is the only way to seed the very first
   credential (every other admin comes in through the invite-link flow
   below, which needs an existing signed-in super admin to generate the
   link).
4. Set `SUPER_ADMIN_EMAILS` to that same address (comma-separated for more
   than one) in your environment. This is what makes the address a *super*
   admin, independent of whatever rows exist in the database — see invariant
   11 below.

Step 4 is a security control and is not optional: having a row in
`admin_credentials` only means an address *can attempt* to sign in: it says
nothing about whether that sign-in is *authorized*. `/admin` requires
**membership of `SUPER_ADMIN_EMAILS`, or an active row in `admin_users`** —
not merely a valid session. An empty or missing `SUPER_ADMIN_EMAILS` together
with an empty or unreachable `admin_users` table authorizes nobody — it does
not fall open.

Without `DATABASE_URL` and `AUTH_SECRET` both configured, the catalog still
renders, served from the static snapshot in `src/lib/config/fallback-tools.ts`,
and `/admin` is unreachable (the proxy sends every request to `/admin/login`,
which itself refuses to render a form with nothing to authenticate against).

## Roles (Phase B)

Two levels, both gated in `src/lib/auth.ts` and re-checked on every admin page
and Server Action, never trusted from a link or a nav item:

- **Super admin** — set via `SUPER_ADMIN_EMAILS`, the bootstrap. Can manage the
  catalog, invite or remove other admins (**Team**), and edit the theme.
- **Admin** — invited by a super admin from **Team**. Can manage the catalog
  only; the Theme and Team links are not shown to them, and the pages behind
  them redirect if reached directly.

Render has no built-in way to send email, so inviting an admin does not send
anything: it generates a one-time link (`/admin/invite/<token>`, the token a
random 32-byte value whose SHA-256 hash — never the token itself — is stored
in `invite_tokens`) that the super admin copies from the Team page and shares
with the invitee themselves, over whatever channel they'd already use. The
link works once, expires after 7 days, and lets the invitee set their own
password; no password is ever generated, emailed, or seen by anyone but the
invitee. Removing an admin from **Team** revokes their access immediately; it
does not touch their `admin_credentials` row, so re-inviting the same address
later does not require them to invent a new password.

## Theme (Phase B)

`/admin/theme` (super admin only) edits the brand name, wordmark, attribution,
tagline, logo, and the six brand-role colours (`primary`, `navy`, `leaf`,
`logo-blue`, `good`, `warning`, `critical`) for light and dark mode. A change
reaches the public site within seconds — the root layout injects the stored
values as a `<style>` block and a save calls `revalidatePath("/", "layout")`.

Two things it will not let you do, on purpose:

- **No free-form CSS.** Only the six named tokens, only a strict 6-digit hex
  value each. The structural tokens that carry the actual contrast
  guarantees (background, surface, body text, control borders) are fixed in
  `globals.css` and not editable here.
- **No palette that fails WCAG.** Every save re-checks all six tokens against
  both the light and dark surfaces at 4.5:1; a failing palette is refused
  with the specific ratios that came up short, and nothing is written.

Logo uploads are stored inline as a base64 `data:` URL in
`site_settings.logo_url` — the app runs entirely on Render (web service +
Render Postgres) with no object storage, and a logo is small and rarely
changed, so a new external dependency wasn't worth adding for it. PNG/JPEG/WebP only, 512 KB cap,
enforced in the Server Action before the bytes are ever encoded. SVG is
rejected — it can carry `<script>`, and a raster logo covers the need.

## Languages (Phase C)

Every public page exists three times — `/en`, `/az`, `/ru` — each prerendered
and separately indexable, with `hreflang` alternates in the page head and the
sitemap. `/`, `/about` and `/tools/<slug>` redirect to the English version
(`next.config.ts`), so old links keep working. The language switcher is plain
links: no JavaScript, so it works with JS off like the rest of the page.

Content: the English base columns stay as they were; AZ/RU translations sit
beside them in a JSONB `i18n` column (tools, knowledge base) and a small
`categories` table (so a category translated once is translated everywhere).
The tool form has EN / AZ / RU tabs; the admin list flags missing
translations. Taglines per locale are in the theme editor. The admin surface
itself stays English.

## AI assistant (Phase D)

Staff sign in at `/{locale}/assistant` and ask about the tools and the
knowledge base; answers come back in the language of the question.

- **Who**: invited staff (Team → Assistant access, `@azerconnect.az` only)
  and all admins. Staff get the same one-time invite link as admins — Render
  cannot send email, so there is no magic link.
- **Settings** (super admin, Admin → Assistant): model (Opus 5.5 default,
  Sonnet 5, Haiku 4.5), API key (AES-256-GCM encrypted at rest; only the
  last four characters are ever shown; `ANTHROPIC_API_KEY` in the
  environment overrides it), on/off, monthly budget, questions per person per
  hour.
- **Knowledge base** (any admin, Admin → Knowledge base): Markdown articles
  with optional AZ/RU versions; only published ones are used.
- **How it answers**: the published knowledge base and the live catalog go
  into the system prompt wholesale, cached with prompt caching; no vector
  database. Questions are delimited as untrusted input. Revisit past ~50k
  tokens of knowledge base (see `src/lib/assistant-prompt.ts`).
- **Cost**: spend is computed from the API's own token counts at the
  published per-model prices (`src/lib/ai-settings.ts`) and the assistant
  switches itself off at the monthly budget.

## Admin panel (Admin Panel Plan, phases 1–5)

Everything below runs on Render (web service + Render Postgres); there is no
other backend.

- **People & security** — accounts (super admin / admin / editor / staff),
  security policy, two-step sign-in (TOTP + recovery codes) required for super
  admins, an append-only audit log with CSV export.
- **Content** — catalog with drafts, publish/unlist/archive, featuring,
  ordering, duplicate, preview in EN/AZ/RU, health checks, **maintenance mode**
  per tool, and **tool icons** (curated glyphs or an uploaded PNG/JPEG/WebP
  logo, served from `/tool-icon/<id>`). Categories (create, rename, merge,
  reorder). Knowledge base with version history, restore, a context meter and a
  test console that answers from drafts.
- **English only** — admins write English; after every save the new or
  changed English is translated into Azerbaijani and Russian automatically
  (the "Translation drafts" AI purpose) and stored. Content → Translations
  shows coverage and allows corrections. With AI off, visitors see English.
- **AI** — API connections for Anthropic, OpenAI, Gemini, Azure OpenAI,
  Mistral or a custom API (keys encrypted, shown by last four only, tested
  without ever reading a response body; only Anthropic can power a purpose
  today), purposes, monthly budget with 50/80/100 % alerts, per-connection
  caps, hourly and daily per-person limits, thumbs ratings and opt-in 30-day
  transcripts for super admins.
- **Brand & operations** — Design Studio (presets, 11 colour tokens behind a
  contrast gate, four fonts checked for ə/Ə and Cyrillic, radius, borders,
  cards, spacing, background, accent rule; draft → preview → publish,
  versions with one-click rollback, date-based schedules), announcements in
  three languages, cookie-free daily usage totals, and JSON backup & restore
  (validated, dry-run diff, typed confirmation, automatic export first).

Public pages stay static (ISR, 60 s) and cookie-free; anything date-based
(schedules, announcements, maintenance) is decided when a page is rendered, so
it takes effect within about a minute.

## Adding a tool

Sign in at `/admin`, click **Add tool**, fill the form. It appears on the
catalog within seconds — no deploy.

Descriptions are **public writing**: this site is indexed, so no internal
codenames, client names, department detail or staging URLs belong in them. A
tool that must not be publicly listed gets `status: unlisted`, which keeps it
out of the catalog, the sitemap and search results while leaving its direct
link working.

## Tool statuses

| Status | In catalog | Clickable | In sitemap |
|---|---|---|---|
| `published` | yes | yes | yes |
| `planned` | yes, dimmed | no | yes |
| `unlisted` | no | via direct link | no |
| `archived` | no | no | no |

## Tests

```bash
npm test          # all suites, ~1s, no framework
```

Each suite guards something that fails silently:

- `tests/ssrf.test.mts` — 30 cases against the health-URL validator, the one
  place admin input drives a server-side fetch. Covers cloud metadata, every
  private range, IPv6 loopback/ULA/link-local, trailing-dot hosts, and
  `javascript:`/`data:` schemes.
- `tests/search.test.mts` — diacritic folding and multi-word AND matching.
  This one earned its place immediately: it disproved a claim in the source
  comments, since NFKD does **not** fold `ə` (U+0259) and so "azerbaycan" did
  not match "Azərbaycan" until an explicit fold map was added.
- `tests/i18n.test.mts` — the Phase C gate: a missing translation falls
  back to English rather than blank; every locale dictionary has every key;
  Russian plurals.
- `tests/secret-box.test.mts` — the stored API key round-trips, and a
  tampered ciphertext or a different key is refused.
- `tests/contrast.test.mts` — the WCAG contrast-ratio math the theme editor's
  save gate depends on (Phase B). Verified against the exact numbers in
  `globals.css`'s header comment, plus edge cases (equal colours, black/white,
  case-insensitive hex) — this is the one control standing between a bad
  palette and a genuine accessibility regression on a live site.

## Notes

- **Phases C and D shipped** (trilingual, staff assistant), plus: the tagline
  now reads "Everything we've built, in one place."; "Simple" in the home
  heading is Azerconnect leaf green; admins can change their own password
  (Admin → your email).
- **`[locale]` deliberately does not set `dynamicParams = false`.** In this
  Next.js version it made every ISR regeneration fail with
  `NoFallbackError`, so catalog edits never reached the public pages. Unknown
  locales still 404, via `isLocale()` in the layout.

- **Migrated off Supabase to plain Postgres + a hand-rolled session (the Render migration),
  to run entirely on Render.** Auth is now `jose` (HS256 JWT in an httpOnly
  cookie) + `bcryptjs`, with DB-backed login rate limiting
  (`admin_credentials.failed_attempts`/`locked_until`) replacing Supabase
  Auth's built-in throttling. RLS is gone — there's no public PostgREST
  endpoint to guard against once the database is reachable only from server
  code, so filtering (e.g. hiding `unlisted` rows) is explicit SQL instead.
  This was made simpler than expected by a Next.js 16 change: `middleware.ts`
  is now `proxy.ts` and **defaults to the Node.js runtime** (it was Edge-only
  before 15.2), so `src/proxy.ts` can run a real `pg` query directly instead
  of needing an Edge-safe workaround. See `db/migrations/`, `src/lib/db/`,
  `src/lib/session.ts`, and the Setup/Roles/Theme sections above, all of
  which describe the current (Postgres) state, not the old Supabase one.
- **Next.js is pinned to 16.3.6, not 16.2.9.** 16.2.9 carries a critical
  advisory set including an App Router middleware/proxy bypass and
  unauthenticated disclosure of Server Function endpoints — both of which bear
  directly on the admin gate.
- **SparkLab cold-starts in ~21 s** (measured) because Render's free tier
  sleeps when idle. The health probe's TTL is 30 minutes specifically so it
  cannot become an accidental keep-warm cron burning that tool's free hours.
- **Rebranded to Azerconnect / One.Simple** (Phase A). Design tokens now come
  from the official Azerconnect wordmark palette, not Vantage's "Field"
  system; every token was re-measured against WCAG from scratch rather than
  inherited — see the header comment in `src/app/globals.css` for the exact
  ratios. The brand-role tokens (`primary`, `navy`, `leaf`, `logo-blue`,
  `good`, `warning`, `critical`) are now admin-editable via `/admin/theme`
  (Phase B); the structural tokens around them are not.
