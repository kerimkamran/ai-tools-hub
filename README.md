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

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in the Supabase values
npm run dev
```

Then in the Supabase SQL editor, run `supabase/migrations/0001_tools.sql`
followed by `supabase/seed.sql`, and create exactly one admin user under
Authentication → Users. There is no signup route: the admin account is created
by hand, on purpose.

Without Supabase configured the catalog still renders, served from the static
snapshot in `src/lib/config/fallback-tools.ts`.

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

## Notes

- **Next.js is pinned to 16.3.6, not 16.2.9.** 16.2.9 carries a critical
  advisory set including an App Router middleware/proxy bypass and
  unauthenticated disclosure of Server Function endpoints — both of which bear
  directly on the admin gate.
- **SparkLab cold-starts in ~21 s** (measured) because Render's free tier
  sleeps when idle. The health probe's TTL is 30 minutes specifically so it
  cannot become an accidental keep-warm cron burning that tool's free hours.
- Design tokens are ported from Vantage's "Field" system so the hub and the
  tools read as one product. `--brand` (#c96f42) is ~3.4:1 on white and is not
  safe for body text; `--brand-deep` (#8b4423) is the accent-text token.
