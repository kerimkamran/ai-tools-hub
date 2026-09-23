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
Public visitor ──► AI Tools Hub (Next.js, Vercel)
  (no account)      static / ISR · no cookies · no middleware on public routes
                         │
        ┌────────────────┼──────────────────┐
        │                │                  │
    /  catalog      /api/health         /admin  (gated)
    /tools/[slug]   cached 30 min       proxy scoped HERE only
        └────────────────┴──────────────────┘
                         ▼
              Supabase Postgres (tools + RLS)
              anon key = read · service role = write, SERVER ONLY

    ── plain links ──►  Vantage · SparkLab · (CV Screener, planned)
```

## Invariants

These are load-bearing. Breaking one is a defect, not a preference.

1. **The public catalog is statically rendered and never touches a cookie.**
   Reading cookies or `searchParams` in `src/app/page.tsx` would opt the route
   into dynamic rendering and destroy edge-cacheable delivery. The `?q=` deep
   link is therefore read on the client.
2. **`src/proxy.ts` matches `/admin` and nothing else.** Widening it puts a
   Supabase session round-trip in front of the catalog.
3. **The service-role key is unreachable from client code.**
   `src/lib/supabase/admin.ts` imports `server-only`, so a client import is a
   *build error*. Verified — the build exits 1.
4. **The proxy is not the auth boundary.** Every admin page and Server Action
   calls `requireAdmin()` / `getAdminOrNull()` itself, using `getUser()` (which
   verifies the JWT) rather than `getSession()`.
5. **`/api/health` only ever fetches `healthUrl` values already in the
   registry**, re-validated, https-only, private/loopback/IP hosts refused,
   `redirect: "manual"`, body never read.
6. **No route accepts a destination URL from a query parameter.** If click
   tracking is ever added it must be `/go/[toolId]`, resolved server-side.
7. **The page works with JavaScript disabled** — the full grid and every link
   are in the server-rendered HTML.
8. **Adding a tool requires no code change**, only a registry row.
9. **`/admin` requires authorization, not just authentication.** A valid
   Supabase session is not sufficient; the email must be in
   `SUPER_ADMIN_EMAILS` **or** an active row in `admin_users` (Phase B).
10. **`unlisted` must not be enumerable.** The anon key is public and speaks
    PostgREST, so RLS admits only `published` and `planned`; unlisted rows
    resolve server-side by exact slug.
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
cp .env.example .env.local   # then fill in the Supabase values
npm run dev
```

Then in Supabase, run the migrations **in order** in the SQL editor:

1. `supabase/migrations/0001_tools.sql`
2. `supabase/migrations/0002_unlisted_not_enumerable.sql`
3. `supabase/migrations/0003_admin_users.sql` — admin roles (Phase B)
4. `supabase/migrations/0004_site_settings.sql` — theme + branding storage bucket (Phase B)
5. `supabase/seed.sql`

Then:

6. Create your first admin user by hand under **Authentication → Users**.
   There is no signup route in this app, on purpose.
7. **Turn off public signups**: Authentication → Providers → Email → uncheck
   "Allow new users to sign up".
8. Set `SUPER_ADMIN_EMAILS` to that user's address (comma-separated for more
   than one). **This replaces the old `ADMIN_EMAILS` variable** — if you are
   upgrading an existing deployment, rename it in your environment (Vercel
   → Settings → Environment Variables) or `/admin` will refuse everyone.

Steps 7 and 8 are both security controls and neither is optional.

A Supabase project accepts public signups at `/auth/v1/signup` by default, so
"has a valid session" is a state any stranger can put themselves in. `/admin`
therefore requires **membership of `SUPER_ADMIN_EMAILS`, or an active row in
`admin_users`** — not merely a session. An empty or missing `SUPER_ADMIN_EMAILS`
together with an empty or unreachable `admin_users` table authorizes nobody —
it does not fall open.

Without Supabase configured the catalog still renders, served from the static
snapshot in `src/lib/config/fallback-tools.ts`, and `/admin` is unreachable.

## Roles (Phase B)

Two levels, both gated in `src/lib/auth.ts` and re-checked on every admin page
and Server Action, never trusted from a link or a nav item:

- **Super admin** — set via `SUPER_ADMIN_EMAILS`, the bootstrap. Can manage the
  catalog, invite or remove other admins (**Team**), and edit the theme.
- **Admin** — invited by a super admin from **Team**. Can manage the catalog
  only; the Theme and Team links are not shown to them, and the pages behind
  them redirect if reached directly.

Inviting an admin sends a one-time Supabase link (`inviteUserByEmail`) — no
password is generated, emailed, or ever seen by anyone but the invitee.
Removing an admin from **Team** revokes their access immediately; it does not
delete their Supabase account.

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

Logo uploads go to a public `branding` Storage bucket, PNG/JPEG/WebP only, 512
KB cap, enforced both in the Server Action and at the bucket level. SVG is
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
