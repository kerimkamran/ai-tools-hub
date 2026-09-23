# AI Tools Hub

One public page that lists independently built AI tools, with search, category
filters and cards that open the real applications.

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
        ┌────────────────┼──────────────────┐
        │                │                  │
    /  catalog      /api/health         /admin  (gated)
    /tools/[slug]   cached 30 min       proxy scoped HERE only
        └────────────────┴──────────────────┘
                         ▼
              Plain Postgres (Render managed database)
              reached only from server code — never from the browser,
              no public REST endpoint, no RLS needed

    ── plain links ──►  Vantage · SparkLab · (CV Screener, planned)
```

## Invariants

These are load-bearing. Breaking one is a defect, not a preference.

1. **The public catalog is statically rendered and never touches a cookie.**
   Reading cookies or `searchParams` in `src/app/page.tsx` would opt the route
   into dynamic rendering and destroy edge-cacheable delivery. The `?q=` deep
   link is therefore read on the client.
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

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in DATABASE_URL, AUTH_SECRET, SUPER_ADMIN_EMAILS
npm run dev
```

Then, against that database:

1. Run the migrations **in order** — either `npm run migrate` (tracks what's
   already applied in a `_migrations` table, safe to re-run), or by hand with
   `psql "$DATABASE_URL" -f db/migrations/0001_tools.sql` and so on through
   `0003_admin_auth.sql`.
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
`site_settings.logo_url` — Render has no object-storage equivalent to
Supabase Storage, and a logo is small and rarely changed, so a new external
dependency wasn't worth adding for it. PNG/JPEG/WebP only, 512 KB cap,
enforced in the Server Action before the bytes are ever encoded. SVG is
rejected — it can carry `<script>`, and a raster logo covers the need.

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
- `tests/contrast.test.mts` — the WCAG contrast-ratio math the theme editor's
  save gate depends on (Phase B). Verified against the exact numbers in
  `globals.css`'s header comment, plus edge cases (equal colours, black/white,
  case-insensitive hex) — this is the one control standing between a bad
  palette and a genuine accessibility regression on a live site.

## Notes

- **Migrated off Supabase to plain Postgres + a hand-rolled session (Phase C),
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
