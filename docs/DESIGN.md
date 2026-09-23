# AI Tools Hub — Design & Implementation Plan

## Context

You build AI/web tools independently (vibe-coded, separate repos, separate hosts). Today they have no common front door: someone who knows about Vantage cannot discover SparkLab, and there is no single URL that says "here is everything."

This plan defines a **Google-simple, accountless catalog page** that makes those independent tools feel like one product — one URL, one search box, category chips, tool cards that launch the real applications. The hub is a *launcher and a directory*, not a platform layer the tools depend on.

The deliberate non-goal: the hub never becomes something a tool can break, and never becomes something you must deploy in order to ship a tool.

### Decisions you made (this plan is built on them)

| Decision | Choice | Consequence baked into this plan |
|---|---|---|
| Exposure | **Fully public + indexed** | SEO surface required (sitemap, per-tool pages, metadata). Catalog copy is public writing — see §4.6. |
| Domain | **`*.vercel.app` for now** | No custom domain, so no subdomains and no rewrites yet. Hostname must not be hardcoded anywhere. |
| Hub backend | **Catalog + health checks**, no AI | No model provider keys in the hub at all. One server route, cached. |
| Tool registry | **Real admin UI in MVP** | Requires a datastore + an admin gate. This is a deliberate step beyond the original "no DB, no admin panel" brief. |
| Cold starts | **Show status, don't keep warm** | Health badge is informational. No keep-warm cron. |

---

## 1. Executive recommendation

**Build a new, standalone Next.js 16 app that links directly to each tool's canonical URL.** No proxying, no iframes, no monolith.

Four findings drive this, all verified against your actual code rather than assumed:

1. **Vantage cannot be embedded.** Its `next.config.ts` sets `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'` on `/(.*)`. Any iframe design is dead on arrival.
2. **Rewrites would break silently.** Vantage sets no `basePath`, so mounted at `/assessment` it would request `/_next/static/*` from the hub's origin — hitting the hub's own build output. The page would render and then fail to hydrate. That is the worst failure class available: looks fine, nothing works.
3. **Your tools are heterogeneous.** Vantage is Next 16 + Supabase on Vercel; SparkLab is Express + Postgres on Render. There is no single runtime to monolith them into.
4. **Every tool has its own login.** Vantage uses Supabase Auth; SparkLab uses scrypt sessions with an `@azerconnect.az` domain allowlist. The hub being accountless does not make the tools accountless — so the hub's job is to *tell users what they'll meet* before they click.

Direct links satisfy your own constraint literally — adding a tool is one record — and mean the hub can never be blamed for a tool's outage, cold start, or auth redirect. When you acquire a real domain, the upgrade path is **per-tool subdomains** (`assessment.yourdomain.com`), which costs one CNAME each, needs zero tool-code changes, and is a one-field edit in the registry.

**The one place this plan deviates from the original brief** is the admin UI, which you asked for explicitly. It brings back a datastore and a login — for you only. §6.2 confines that blast radius so the public page stays static and cookie-free.

---

## 2. Current repository assessment

There is **no hub repository**. This is greenfield. What exists are three independent tools:

### Tool A — Vantage (AI Assessment Center) · `aiac-platform`

| Aspect | Finding |
|---|---|
| Stack | Next.js **16.2.9**, React **19.2.4**, Tailwind **v4**, TypeScript 5, App Router + Server Actions |
| Data/auth | Supabase Auth + Postgres with RLS; `src/middleware.ts` runs `updateSession` on nearly every route |
| Hosting | Vercel — `https://vantage-ag.vercel.app` |
| Headers | HSTS (`includeSubDomains; preload`), `X-Frame-Options: DENY`, CSP with `frame-ancestors 'none'` |
| AI | `connect-src` allows `api.anthropic.com`, `api.moonshot.ai` |
| Access | Own `/login`, `/signup`, `/forgot-password`, `/invite/callback` |
| Design | "Field" design system — near-white surfaces, hairline dividers, one clay accent, Inter |

### Tool B — SparkLab · `sparklab-azerconnect` v2.3.0

| Aspect | Finding |
|---|---|
| Stack | Node ≥18, Express 4 (ESM), static `public/index.html`, Postgres (Neon) |
| Hosting | **Render free tier**, Oregon, `healthCheckPath: /api/health` |
| Auth | scrypt password hashes + signed session tokens; `ALLOWED_EMAIL_DOMAINS=azerconnect.az` |
| AI | `ANTHROPIC_API_KEY` server-side |
| Risk | Free tier sleeps when idle → slow first request |

### Tool C — CV Screener — **planning stage, not built**

React 19 + Vite + Tailwind, NestJS/Fastify BFF, Postgres 17 + pgvector, corporate OIDC, EU-region hosting, EU AI Act Annex III posture. Auth-gated by construction. **No domain or URL decided.** Ships as a `planned` card with no link.

### What to reuse

**The single most valuable reusable asset is Vantage's design token set** (`src/app/globals.css`). It already *is* the aesthetic this brief asks for — its own comments describe it as "deliberately plain, editorial, light-first… near-white surfaces, hairline dividers instead of boxed shadows… exactly one accent color." Adopting the same tokens is what will make the hub and Vantage read as one product.

Copy verbatim into the hub:

```
--background #ffffff   --foreground #1a1a1a   --muted #6b6b6b
--faint #8a8a8a        --line #ececec         --line-soft #f2f2f2
--brand #c96f42 (clay) --brand-deep #8b4423   --brand-50 #fbf1ea
--shadow-sm 0 1px 2px rgba(0,0,0,.04)
```

Also reuse: **Inter** via `next/font/google` (same type system, hierarchy from size/weight not typeface); the `@theme inline` Tailwind v4 token-bridging pattern; the dark-mode `.dark` class + inline no-flash script; and the **security headers block** from `next.config.ts` as a starting point.

**Do not reuse:** the Supabase middleware matcher pattern (it must be scoped to `/admin` only — see §6.2), the `aiac-theme` localStorage key (use `hub-theme`), or anything from `src/app/admin/*` — that is enterprise RBAC/audit tooling for a different product.

---

## 3. Product definition

### What the hub is

- One public URL listing every AI tool you have built.
- A search box and a few category chips.
- A card per tool that opens the real application.
- A page you can add a tool to in under two minutes, from a browser.

### What the hub is not

- **Not an identity provider.** It does not log anyone in, and it does not carry a session to the tools. Each tool keeps its own auth.
- **Not a proxy or a shell.** Tools are not wrapped, framed, or served through it.
- **Not a dependency.** If the hub is down, every tool still works at its own URL.
- **Not a governance platform.** No RBAC, SCIM, DLP, SIEM, audit infrastructure, quotas, or approval workflows.
- **Not an AI product.** It makes zero model calls and holds zero provider keys.

### Ideas carried forward from the enterprise spec

Kept: central catalog, structured tool metadata, independent tool deployment, lifecycle status as a *display* concept, and a registry shaped so usage/cost awareness and an AI gateway can attach later.

Dropped from MVP: corporate SSO, MFA, SCIM, RBAC/ABAC, SIEM, DLP, immutable audit, chargeback, Kubernetes, approval workflows, multi-region governance, model governance.

### Product principles (tie-breakers when this document is ambiguous)

1. Simplicity over completeness.
2. Tools first, platform second.
3. No authentication for visitors — ever, in MVP.
4. Adding a tool takes minutes.
5. The hub never blocks a tool's deploy.
6. No provider secret ever reaches the browser.
7. If a feature needs a new service, it needs a reason in writing.

---

## 4. UX specification

### 4.1 Homepage anatomy

```
┌──────────────────────────────────────────────────────────┐
│  AI Tools                                          ◐      │  56px header, hairline bottom
└──────────────────────────────────────────────────────────┘

                        AI Tools                              40/48px, weight 600
              Everything I've built, in one place.            15px, --muted

              ┌────────────────────────────────┐
              │ ⌕  Search tools…            /  │              max-w 560px, 48px tall
              └────────────────────────────────┘

         All · Research · HR · Writing · Analysis              chips, 32px tall

  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
  │ ▣  Vantage   │ │ ▣  SparkLab  │ │ ▣  CV Scr.   │
  │              │ │              │ │              │
  │ Competency   │ │ Innovation   │ │ Screening    │
  │ assessments… │ │ pipeline…    │ │ (coming soon)│
  │              │ │              │ │              │
  │ HR · Sign-in │ │ HR · Sign-in │ │ HR · Planned │
  │ vantage-ag…  │ │ sparklab-…   │ │              │
  └──────────────┘ └──────────────┘ └──────────────┘
```

Layout: content column `max-w-[1100px]`, search block `max-w-[560px]` centred. Vertical rhythm on an 8px scale. Header is a small wordmark and a theme toggle — nothing else.

### 4.2 Core flow (six steps, no detours)

1. Open the URL → catalog is visible immediately, above the fold, no hero.
2. Type in the search box → grid filters as you type, no submit.
3. Optionally click a category chip.
4. Click a card.
5. The tool opens **in a new tab**.
6. The hub stays behind, still filtered, ready for the next tool.

No onboarding, no modal, no cookie banner (see §6.6 — we have nothing to consent to), no "get started" step.

### 4.3 Search behaviour

- **Client-side**, in-memory, over `name + description + category + tags`. For a catalog this size, anything more is waste — no vector search, no embeddings, no search service.
- Case- and diacritic-insensitive; normalise with `.normalize('NFKD')` so `Azərbaycan`-style input matches.
- Substring match on a single normalised haystack per tool. Multi-word queries AND together, so `hr assess` matches.
- Debounce **120 ms** for the ARIA announcement only — the visual filter is synchronous.
- `/` focuses the search box from anywhere; `Esc` clears and blurs.
- **No autofocus on mobile** (it forces the keyboard up and buries the catalog). Autofocus on pointer-fine devices only.
- Query syncs to `?q=` via `replaceState` so results are shareable and back-button-safe.

### 4.4 Categories

Single-select chips, `All` default, driven by the distinct categories actually present in the registry — never a hardcoded list that can drift. Start with: **All, HR, Research, Writing, Analysis, Productivity**. A category with zero published tools does not render. Chips scroll horizontally on mobile with no scrollbar chrome. Category combines with search as AND. This is a filter, not a taxonomy — no subcategories, no tag manager.

### 4.5 The tool card

Each card is a single `<a>` — the whole card is the hit target.

| Element | Rule |
|---|---|
| Icon | 32px. Emoji or inline SVG, stored as a string. No image pipeline in MVP. |
| Name | 16px / 600. |
| Description | 14px, `--muted`, clamped to 2 lines. Written for a stranger. |
| Category | 12px, `--faint`. |
| Access badge | `Open` · `Sign-in required` · `Invite only` · `Planned`. |
| Access note | One short line, **visible body text, never a tooltip** — tooltips don't exist on touch and this is disqualifying information. SparkLab's reads "@azerconnect.az accounts only". |
| Destination host | 12px `--faint`, e.g. `vantage-ag.vercel.app`. Sets the expectation that you are leaving. |
| Health dot | 6px dot, appears only after the health fetch resolves. Space is reserved so nothing shifts. |

**Hover:** border `--line` → `--foreground` at 15% and `--shadow-sm`. 120 ms. That is the entire animation budget for the page.

**`status: 'planned'`** renders as a `<div>`, not a link: 60% opacity, no hover, `aria-disabled`. Never ship a card that leads to a 404.

### 4.6 Content rules (because the hub is public and indexed)

Every field is public writing. Therefore:

- Descriptions explain **what the tool does for a user**, not internal architecture, client names, department names, or project codenames.
- No internal hostnames, ticket IDs, or staging URLs.
- Naming stays consistent with the tools' own branding — "Vantage", not "AIAC".
- A tool that must not be publicly known **does not get a card**. Add an `unlisted` status that keeps it out of the catalog, sitemap, and search index while remaining reachable at its detail URL.

### 4.7 Launch behaviour — new tab

`<a href={tool.url} target="_blank" rel="noopener">` — a real anchor, not `window.open()`, so middle-click, ⌘-click, "copy link address" and crawlers all behave.

Forced new tabs are usually user-hostile. Three reasons they are right *here*:

1. The destination runs a multi-step auth flow. Same-tab means Back must traverse Supabase middleware redirects and PKCE callback history entries to get home — and will often dump the user on `/login` instead.
2. The hub is a catalog; the browsing task isn't over when one tool opens.
3. SparkLab's cold start is far less alarming when the hub is visibly alive in the other tab.

Mitigations: `rel="noopener"` (security — and unlike `noreferrer` it preserves the referrer for attribution), a small external-link glyph, and `(opens in new tab)` in the accessible name.

**Link to the tool's root, not its `/login`.** Vantage's middleware already routes a signed-in user straight in; linking to `/login` forces a pointless re-auth for people who have a session.

### 4.8 Responsive behaviour

| Breakpoint | Grid | Notes |
|---|---|---|
| < 640px | 1 col | 16px gutters; chips scroll horizontally; no autofocus |
| 640–1023px | 2 col | |
| ≥ 1024px | 3 col | `max-w-[1100px]`, centred |

Fluid between breakpoints via `repeat(auto-fill, minmax(280px, 1fr))`. Tested at 320px (iPhone SE) with no horizontal scroll.

### 4.9 States

- **Empty query, no tools:** "No tools published yet." (only reachable on a fresh install)
- **No matches:** "No tools match *«query»*." + a Clear button that resets both search and category.
- **Health unknown:** no dot. Absence of signal is never rendered as a negative signal.
- **JS disabled:** the full server-rendered grid is present and every card links out. Only search and filtering are lost. This is a hard requirement, and it is also why the page is indexable.

---

## 5. Architecture options considered

| | Simplicity | Vibe-coding fit | Deploy independence | One domain | Maintenance | Perf | Security | Future |
|---|---|---|---|---|---|---|---|---|
| **A. Monolith** (tools as routes) | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ~ | ✗ |
| **B. Rewrites/proxy** | ✗ | ✗ | ~ | ✓ | ✗ | ✗ | ✗ | ~ |
| **C. Subdomains** | ✓ | ✓ | ✓ | ~ | ✓ | ✓ | ✓ | ✓ |
| **D. Direct links** ← MVP | ✓✓ | ✓✓ | ✓✓ | ✗ | ✓✓ | ✓✓ | ✓✓ | ✓ |

**A — Monolith.** Vantage's middleware runs on nearly every route. Merging it in means your instantly-cacheable catalog page runs Supabase session refresh on every request, destroying the one property that is the point of the product. Adding tool #4 would mean *building tool #4 inside the monolith*. Rejected.

**B — Vercel rewrites.** Genuinely attractive on paper, and Vercel does document rewrites as transparent proxies. Against your actual code it fails on four independent counts:

- **`/_next` collision.** Two Next apps cannot share `/_next` on one origin. Without `basePath: '/assessment'` in *Vantage's* repo, chunks resolve to the hub's build → hydration dies while the page looks correct.
- **Escaping redirects.** `redirect('/login')` emits a root-relative `Location`, resolved against the hub origin → hub 404. `/login`, `/api`, `/auth` are root-namespace claims; one tool can own them, tool #2 cannot. This dead-ends at n=2.
- **Server Actions 403.** Next checks the action POST's `Origin` against `Host`/`x-forwarded-host`. A mismatch 403s every mutation *after* login — past where a smoke test stops. Needs `serverActions.allowedOrigins` in the tool's config.
- **Cookies at the wrong scope.** The browser attributes `Set-Cookie` to the hub origin. Supabase's `sb-*-auth-token` at `Path=/` would ride along on every static catalog request, and a generically named SparkLab `session` cookie could silently overwrite another tool's. Silent, intermittent session loss.

Plus: Render cold starts inside a Vercel invocation's response deadline turn "the other app is slow" into "**your** domain returns 504", and Next derives `metadataBase` from `VERCEL_URL`, so canonical/OG tags would point at `vantage-ag.vercel.app` anyway — the proxy is transparent to users and transparently reverses itself for crawlers and link unfurls.

Every one of these is fixable *only by changing each tool's repo*, which is exactly the coupling you are trying to avoid. **Rejected for MVP.** Revisit only for a future tool built rewrite-aware from day one.

**C — Subdomains.** The right long-term answer, unavailable today because you have no custom domain. One CNAME + one dashboard entry per tool, no tool code changes, and attaching a primary domain makes Vercel 308 the `.vercel.app` URL away, killing the canonical duplication for free. **The single rule to write down: never set `Domain=.yourdomain.com` on any tool cookie** — that is the only way tools could bleed into each other here.

**D — Direct links.** Chosen. The precedent is Google's own catalog: `mail.google.com`, `docs.google.com`, `meet.google.com` — separate origins, separate sessions, nobody proxies. Cohesion comes from visual system, naming, and a persistent way back — not from URL laundering.

**D → C is a one-field edit per tool** (`url`), because the registry stores the destination as data. D is not a detour; it is C with the DNS step deferred.

---

## 6. Recommended architecture

```
                         ┌─────────────────────────┐
   Public visitor ─────► │   AI Tools Hub          │   Next.js 16 · Vercel
   (no account)          │   ai-tools-hub.         │   Static / ISR · no cookies
                         │        vercel.app       │   NO middleware on public routes
                         └───────────┬─────────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
      ┌───────▼────────┐   ┌─────────▼────────┐   ┌─────────▼─────────┐
      │  /  catalog    │   │ /api/health      │   │ /admin  (gated)   │
      │  static + ISR  │   │ server-only      │   │ middleware scoped │
      │  /tools/[slug] │   │ cached 5 min     │   │ HERE only         │
      └───────┬────────┘   └─────────┬────────┘   └─────────┬─────────┘
              │                      │                      │
              └──────────┬───────────┴──────────────────────┘
                         ▼
              ┌─────────────────────┐
              │  Supabase Postgres  │   tools table + RLS
              │  anon key: read     │   Supabase Auth: 1 admin user
              │  service role:write │   service role = SERVER ONLY
              └─────────────────────┘

   ── plain <a target="_blank"> ──►  no proxy, no iframe, no shared session
              │                │                 │
      ┌───────▼──────┐ ┌───────▼───────┐ ┌───────▼────────┐
      │  Vantage     │ │  SparkLab     │ │  CV Screener   │
      │  Vercel      │ │  Render free  │ │  (planned)     │
      │  Supabase au.│ │  scrypt auth  │ │  corporate OIDC│
      │  frames:DENY │ │  cold starts  │ │  EU region     │
      └──────────────┘ └───────────────┘ └────────────────┘
```

### 6.1 Stack

Next.js **16.2.9** (App Router), React **19.2.4**, TypeScript 5, Tailwind **v4** — deliberately identical to Vantage, so there is one stack in your head and the design tokens port without translation. Supabase (`@supabase/supabase-js` + `@supabase/ssr`) for the registry and the admin login. Hosted on Vercel. **No component library, no state manager, no data-fetching library, no chart library, no animation library.**

### 6.2 Why Supabase, and how the admin UI is contained

Supabase over Vercel Edge Config / Blob / KV because you already run it in Vantage (zero new vendor, zero new mental model), it has no size ceiling worth worrying about, RLS expresses "public read, admin write" declaratively, and it is where Phase-2 click analytics and health history will want to live anyway.

The admin UI is the one place this plan adds machinery, so it is fenced:

- **Supabase Auth with exactly one admin user** — not a hand-rolled password check. Password hashing, login rate-limiting and session refresh are solved problems, and getting a timing-safe comparison subtly wrong is a real risk.
- **`src/middleware.ts` matcher is `['/admin/:path*']` and nothing else.** This is the critical line in the whole repo. Vantage's matcher covers nearly every route; copying that here would put a session-refresh round-trip in front of the public catalog and destroy its cacheability. The public pages must stay static, cookie-free and edge-cached.
- `/admin` is `noindex`, excluded from `sitemap.ts`, and `Disallow`ed in `robots.txt`.

### 6.3 Rendering and caching

| Route | Strategy | Why |
|---|---|---|
| `/` | Server component, `revalidate = 60` | Tools change rarely; near-static delivery |
| `/tools/[slug]` | `generateStaticParams` + ISR | SEO surface; deep links |
| `/api/health` | `revalidate = 300`, dynamic | Never blocks paint |
| `/admin/*` | Fully dynamic, `no-store` | Correctness over speed |

An admin save calls `revalidatePath('/')` and `revalidateTag('tools')` so changes appear immediately rather than after 60s.

### 6.4 The health check — and its one real hazard

`/api/health` iterates registry entries that have a `healthUrl`, fetches each with a **3 s timeout** and `redirect: 'manual'`, and returns only `{ id, state: 'up' | 'slow' | 'unknown' }`. It never returns a response body, status code, or header from the tool.

**The hazard is SSRF.** The admin UI lets a human type a URL that the *server* then fetches. If that admin account is ever compromised, `healthUrl` becomes a probe into anything the Vercel function can reach. Controls, all of them required:

- Only URLs already stored in the registry are ever fetched — no URL is accepted from a query parameter.
- Scheme must be `https:`. Reject on write and again on read.
- Reject hostnames resolving to private/link-local/loopback ranges (`10/8`, `172.16/12`, `192.168/16`, `127/8`, `169.254/16`, `::1`, `fc00::/7`) and reject bare IP literals.
- `redirect: 'manual'` — never follow a redirect to somewhere else.
- Response body discarded unread.
- Route is rate-limited and cached; a burst of requests cannot be turned into a scanner.

Client-side, the badge is fetched **after** hydration and rendered into reserved space, so it contributes nothing to LCP and cannot cause layout shift. SparkLab's expected `slow` state (Render free tier sleeps when idle) is shown as **"Waking up…"** — honest, and it pre-explains the wait instead of leaving the user staring at a blank tab. There is no keep-warm cron: 24/7 pinging would consume nearly all of Render's ~750 free instance-hours per month.

### 6.5 Click tracking (built now, used later)

Cards link **directly** to the tool. If you later want click counts, add `/go/[toolId]` which looks up the destination **server-side from the registry** and 302s.

**Never build `/go?url=<anything>`.** That is a textbook open redirect: it lends your domain's reputation to any phishing destination, and it is the single most common way a simple catalog site becomes an abuse vector. Not in MVP; when it arrives, ID-keyed only.

### 6.6 What the hub deliberately does not have

No cookie banner (no analytics cookies, no third-party embeds — nothing to consent to; keep it that way and the banner never becomes necessary). No service worker. No i18n framework — English only, but all UI strings live in one `strings.ts` so adding AZ/RU later (which the CV Screener will need) is mechanical rather than a refactor.

---

## 7. Data / configuration model

```ts
// src/lib/types.ts
export type ToolStatus   = 'published' | 'planned' | 'unlisted' | 'archived'
export type ToolAccess   = 'open' | 'sign-in' | 'invite-only'
export type ToolHealth   = 'up' | 'slow' | 'unknown'

export type Tool = {
  id: string            // stable, never reused — 'vantage'
  slug: string          // URL segment for /tools/[slug]
  name: string          // 'Vantage'
  tagline: string       // ≤ 60 chars, card description (public writing)
  description: string   // 1–2 paragraphs, detail page + meta description
  category: string      // single category; drives the chips
  tags: string[]        // search-only, not rendered
  icon: string          // emoji or inline SVG string
  url: string           // canonical destination — THIS is the field that
                        // changes when you move to subdomains later
  healthUrl?: string    // https only; must pass SSRF validation
  access: ToolAccess
  accessNote?: string   // '@azerconnect.az accounts only'
  status: ToolStatus
  sortOrder: number
  createdAt: string
  updatedAt: string
}
```

```sql
-- supabase/migrations/0001_tools.sql
create table public.tools (
  id          text primary key,
  slug        text not null unique,
  name        text not null,
  tagline     text not null check (char_length(tagline) <= 80),
  description text not null default '',
  category    text not null,
  tags        text[] not null default '{}',
  icon        text not null default '',
  url         text not null,
  health_url  text,
  access      text not null default 'sign-in'
              check (access in ('open','sign-in','invite-only')),
  access_note text,
  status      text not null default 'planned'
              check (status in ('published','planned','unlisted','archived')),
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.tools enable row level security;

-- Anyone may read what is meant to be seen. Nothing else is exposed.
create policy tools_public_read on public.tools
  for select to anon, authenticated
  using (status in ('published','planned'));

-- No insert/update/delete policy exists, so writes are possible ONLY via the
-- service-role key, which lives server-side in Server Actions. This is the
-- security boundary — not a check in the UI.

create index tools_status_sort_idx on public.tools (status, sort_order);
```

Seed rows (note the public-facing wording):

| id | name | category | access | accessNote | status |
|---|---|---|---|---|---|
| `vantage` | Vantage | HR | `invite-only` | Access by invitation | published |
| `sparklab` | SparkLab | Productivity | `sign-in` | @azerconnect.az accounts only | published |
| `cv-screener` | CV Screener | HR | `sign-in` | — | planned |

> Confirm whether Vantage's public `/signup` is genuinely open. If it is, the badge should read `sign-in` / "Free account" rather than `invite-only`. The route exists alongside `/invite/callback`, so this is ambiguous from the code alone.

### The seam that keeps this cheap

```ts
// src/lib/registry.ts — the ONLY module that knows where tools come from
export async function getPublishedTools(): Promise<Tool[]>
export async function getToolBySlug(slug: string): Promise<Tool | null>
export async function getAllToolsForAdmin(): Promise<Tool[]>
```

Every page imports from here. Swapping the datastore, adding a cache layer, or falling back to a static file is a change to one file.

**Ship a `src/config/fallback-tools.ts` static snapshot** that `getPublishedTools()` returns if Supabase is unreachable. The catalog then survives a database outage in read-only form. This costs ~20 lines and removes the only new single point of failure the admin UI introduces.

---

## 8. Routing strategy

### MVP — direct links

| Tool | Link | Target |
|---|---|---|
| Vantage | `https://vantage-ag.vercel.app` | new tab |
| SparkLab | `https://sparklab-azerconnect.onrender.com` | new tab |
| CV Screener | none — `planned`, renders disabled | — |

Hub routes:

| Route | Purpose | Indexed |
|---|---|---|
| `/` | Catalog, search, filter | ✓ |
| `/tools/[slug]` | Detail page — SEO surface, shareable deep link | ✓ |
| `/about` | One short paragraph | ✓ |
| `/api/health` | Cached status probe | ✗ |
| `/admin`, `/admin/tools/[id]`, `/admin/login` | Registry CRUD | ✗ `noindex` |

### On the detail page — reconciling two goals

"Avoid extra steps" and "fully public + indexed" pull in opposite directions: per-tool pages are the main SEO surface, but they are also an extra click.

Resolution: **the card's primary action goes straight to the tool** — one click, no interstitial. `/tools/[slug]` exists as a *secondary* affordance (a small "Details" link in the card footer) and as the canonical URL crawlers and link-unfurlers see. Nobody is forced through it, and it earns its place in the sitemap.

### Upgrade path when you own a domain

1. Add the apex/`ai.` domain to the hub's Vercel project; mark it primary (Vercel 308s the `.vercel.app` URL → canonical duplication solved).
2. Per tool: CNAME `assessment` → the tool's host, add the custom domain in that tool's dashboard, wait for the cert.
3. In each tool, add the new origin to its auth redirect allow-list (Supabase Auth → Site URL / Redirect URLs; SparkLab → `APP_URL`).
4. In the hub admin, edit one field: `url`.
5. Reconsider same-tab launching — cross-subdomain navigation inside one registrable domain reads as staying in the product.

No hub code changes at any step. **Verify before committing:** that Render's free tier supports custom domains with automatic certs — if it does not, SparkLab stays on `onrender.com` and the hybrid is simply the honest answer for that one tool.

---

## 9. MVP scope and priorities

### P0 — must have (the product does not exist without these)

- Catalog homepage, server-rendered, all published tools
- Client-side search over name/tagline/category/tags
- Category chips, single-select, derived from data
- Tool card with icon, name, tagline, category, access badge, access note, destination host
- New-tab launch with `rel="noopener"`
- `planned` renders disabled, never a dead link
- Responsive 1/2/3 columns, verified at 320px
- Keyboard navigation + visible focus; WCAG 2.1 AA on the homepage
- Security headers; zero secrets in the client bundle
- Supabase `tools` table + RLS
- Admin login (Supabase Auth, one user) + admin list/create/edit/delete
- Middleware scoped to `/admin` only
- Empty and no-match states
- Deployed and reachable

### P1 — should have (first week after launch)

- `/tools/[slug]` detail pages + `sitemap.ts` + `robots.txt`
- `/api/health` with SSRF controls, cached; "Waking up…" for SparkLab
- Dark mode via the ported `.dark` tokens + no-flash script
- `?q=` URL sync; `/` and `Esc` shortcuts
- `/about`
- Static fallback registry for Supabase outages
- OG image + metadata

### P2 — could have (only if a real need appears)

- `/go/[toolId]` click counting (ID-keyed; never URL-keyed)
- Health history / uptime sparkline
- Drag-to-reorder in admin
- Multi-select categories
- AZ/RU locales
- Icon upload to Supabase Storage

### Explicitly excluded from MVP

Visitor accounts, login, signup, SSO, MFA, SCIM, RBAC/ABAC, organisations, teams, permissions · iframes (impossible for Vantage) · rewrites/proxying · favourites, recents, personalisation · vector/semantic search, RAG, embeddings · AI gateway, model routing, quotas, budgets, cost tracking · audit logs, SIEM, DLP · approval and publishing workflows · CMS, rich text editing · Stripe/billing · notifications, feedback forms, announcements · cookie banner · Kubernetes, Docker, microservices · E2E test infrastructure (see §11 for what replaces it)

---

## 10. Implementation plan

Ordered by dependency. Each step is independently verifiable. Estimates assume you, working the way you normally do.

### Phase 0 — Foundation *(~half a day)*

1. **Scaffold.** `create-next-app` → TypeScript, App Router, Tailwind v4, `src/`, import alias. Pin Next 16.2.9 / React 19.2.4 to match Vantage.
2. **Port the design system.** Copy Vantage's `:root` / `.dark` token blocks and `@theme inline` bridge into `globals.css`. Inter via `next/font/google`. Root layout + metadata. *Verify: a page rendering a token swatch matches Vantage's palette.*
3. **Security headers.** Port the `headers()` block from Vantage's `next.config.ts`; set `frame-ancestors 'none'`; CSP `connect-src` allows `'self'` + `https://*.supabase.co` only — **no AI provider hosts, the hub makes no model calls.**
4. **Repo + Vercel.** Push to GitHub, import to Vercel, confirm the preview URL builds.

> *Gate: a blank styled page is live on `*.vercel.app` with correct headers.*

### Phase 1 — Data layer *(~half a day)*

5. **Supabase project** + run `0001_tools.sql` (table, checks, RLS, index).
6. **Env vars** in `.env.local` and Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (**server-only, no `NEXT_PUBLIC_` prefix**). Commit `.env.example`, never `.env.local`.
7. **Types + registry seam.** `src/lib/types.ts`, `src/lib/supabase/{server,admin}.ts`, `src/lib/registry.ts`.
8. **Seed** the three tools via SQL.

> *Gate: `getPublishedTools()` returns 3 rows in a server component.*

### Phase 2 — Public catalog *(~1 day)* — **this is the product**

9. **`ToolCard`** — pure presentational: icon, name, tagline, category, access badge + note, destination host, external glyph, `planned` disabled variant.
10. **`ToolGrid`** — responsive `auto-fill minmax(280px, 1fr)`.
11. **Homepage server component** — header, wordmark, title, `getPublishedTools()` → full grid rendered server-side. *No JS yet: confirm it works with JS disabled.*
12. **`SearchAndFilter` client component** — hoists query + category state, filters the server-provided list. Normalised multi-word AND matching. Empty/no-match states.
13. **Keyboard + a11y** — `/` focus, `Esc` clear, pointer-fine-only autofocus, `aria-live="polite"` result count (debounced 120 ms), `(opens in new tab)` in accessible names, focus rings.

> *Gate: the brief's acceptance criteria for search, filter, launch and mobile all pass by hand.*

### Phase 3 — Admin *(~1–1.5 days)*

14. **`src/middleware.ts`** — Supabase `updateSession`, matcher **`['/admin/:path*']`**. Write the reason in a comment so nobody widens it later.
15. **`/admin/login`** — Supabase Auth email+password; create the single admin user in the Supabase dashboard, not in code.
16. **`/admin`** — table of all tools (every status), status badges, Edit/Delete, "Add tool".
17. **`/admin/tools/[id]` + Server Actions** — create/update/delete via the **service-role** client. Zod validation: slug uniqueness and URL-safety, `https:` schemes only, `healthUrl` through the SSRF validator, tagline length, category non-empty. `revalidatePath('/')` on every write.
18. **`noindex`** on all `/admin` routes.

> *Gate: adding a tool in the browser makes it appear on `/` within seconds, with no deploy.*

### Phase 4 — Polish and SEO *(~1 day)*

19. **`/tools/[slug]`** + `generateStaticParams` + per-tool metadata; "Details" link in the card footer.
20. **`robots.txt` + `sitemap.ts`** — allow `/` and `/tools/*`, disallow `/admin`; exclude `unlisted`.
21. **`/api/health`** — SSRF validator, 3 s timeout, `redirect: 'manual'`, 5-min cache, `{id, state}` only. Client fetch post-hydration into reserved space. "Waking up…" for `slow`.
22. **Dark mode** — `.dark` tokens + no-flash inline script (key: `hub-theme`) + header toggle.
23. **`?q=` sync**, `/about`, OG image, fallback registry snapshot.

### Phase 5 — Verification and launch *(~half a day)*

24. **Manual matrix** — see §11.
25. **Lighthouse** on the deployed URL — target ≥ 95 across the board.
26. **Bundle secret scan** — the non-negotiable check, §12.
27. **Real-device pass** — one iOS, one Android.
28. **Launch**, then re-run the click-through on production.

**Total: roughly 4–5 working days.** Phases 0–2 alone (~2 days) produce a shippable catalog; Phase 3 is the cost of the admin UI you asked for.

---

## 11. Acceptance criteria

### Functional

- [ ] Homepage renders every `published` tool without interaction or scrolling on a 1440×900 desktop.
- [ ] Typing `assess` shows Vantage and hides non-matching tools; results update as you type, with no submit.
- [ ] Multi-word `hr assess` matches (AND, not phrase).
- [ ] Search matches tagline and tags, not just name.
- [ ] Clicking a category chip filters; `All` restores; category AND search compose correctly.
- [ ] Clicking a card opens the correct tool in a **new tab**; the hub tab retains its filter state.
- [ ] `planned` cards are visibly disabled and are not links.
- [ ] Every card shows access badge, access note where present, and destination host.
- [ ] No-match state shows the query and a working Clear button.
- [ ] **Adding a tool via `/admin` makes it appear on `/` with no code change and no deploy.**
- [ ] **No login, signup, or account prompt appears anywhere on a public route.**
- [ ] `/tools/[slug]` loads directly and is in the sitemap; `/admin` is not.

### Security *(each is a blocking release gate)*

- [ ] `grep -rE "SERVICE_ROLE|sk-|ANTHROPIC|sk_live|secret" .next/static/` returns **zero** matches.
- [ ] Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` appear in client JS.
- [ ] Anon-key `insert`/`update`/`delete` against `tools` is rejected by RLS (test it in the SQL editor — do not assume).
- [ ] `/admin` unauthenticated redirects to `/admin/login`; direct `/admin/tools/x` does too.
- [ ] Response headers on `/` include CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`.
- [ ] `/api/health` refuses a `healthUrl` pointing at `http://`, `127.0.0.1`, `169.254.169.254`, or a bare IP.
- [ ] No route accepts a destination URL from a query parameter.

### Accessibility — WCAG 2.1 AA

- [ ] Tab reaches search → chips → every card, in visual order, with a visible focus indicator throughout.
- [ ] `/` focuses search; `Esc` clears and blurs.
- [ ] Card accessible name includes the tool name and "opens in new tab".
- [ ] Result count is announced by a screen reader on filter change (throttled, not per keystroke).
- [ ] Body text ≥ 4.5:1, UI borders ≥ 3:1. **Specifically verify the clay accent** — `#c96f42` on white is ~3.4:1 and **fails for body text**; use `--brand-deep #8b4423` wherever the accent carries text.
- [ ] `--faint #8a8a8a` (~3.5:1) is used only for large or non-essential text, never body copy.
- [ ] Touch targets ≥ 44×44px.
- [ ] Zero critical axe DevTools violations on `/` and `/tools/[slug]`.
- [ ] `prefers-reduced-motion` removes hover transitions.
- [ ] Status is never conveyed by colour alone — badges carry text, health dots carry a label.

### Performance

- [ ] Lighthouse ≥ 95 performance / ≥ 95 a11y / ≥ 95 best practices / ≥ 95 SEO on the deployed URL.
- [ ] LCP < 1.5 s on simulated 4G; CLS < 0.05 including after health badges resolve.
- [ ] Client JS for `/` under ~60 kB gzipped.
- [ ] With JS disabled, all tools render and every link works.

### Responsive

- [ ] 320px: no horizontal scroll, 1 column, chips scroll, keyboard does not auto-open.
- [ ] 768px: 2 columns. ≥1024px: 3 columns, centred, max 1100px.
- [ ] Verified on one real iOS and one real Android device.

---

## 12. Risks and mitigations

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | **Service-role key leaks into the client bundle.** One `NEXT_PUBLIC_` typo or one import of the admin client from a `'use client'` file publishes full DB write access — and the hub is public and indexed. | **Critical** | Admin client lives only in `src/lib/supabase/admin.ts` with `import 'server-only'` at the top, which makes a client import a **build error**. Grep gate in §11. Never log env objects. |
| 2 | **SSRF via `healthUrl`.** An admin-entered URL that the server fetches is a probe into anything the function can reach, including cloud metadata endpoints. | **High** | Full control set in §6.4: https-only, private-range and bare-IP rejection, `redirect: 'manual'`, registry-only URLs, body discarded, rate-limited and cached. Validate on write *and* on read. |
| 3 | **Open redirect**, if click tracking is added carelessly as `/go?url=`. | **High** | Never accept a destination from a query parameter. `/go/[toolId]` resolves server-side from the registry. Stated now so the shortcut is never taken later. |
| 4 | **Iframe embedding is impossible for Vantage** (`X-Frame-Options: DENY`, `frame-ancestors 'none'`). | Medium | Already designed out. Fails loudly in console, so it cannot ship unnoticed. |
| 5 | **Rewrites break hydration silently** if attempted later without `basePath`. | Medium | Documented in §5. Any future rewrite requires `basePath`, `serverActions.allowedOrigins`, and scoped cookie paths **in the tool's repo** first. |
| 6 | **SparkLab cold starts** make the hub feel broken. | Medium | Direct link, so the wait happens on `onrender.com` in the browser's own loading state, not as a hub 504. "Waking up…" pre-explains it. Never proxied. |
| 7 | **Public catalog leaks internal information.** You chose indexed + public; tool metadata is now public writing. | Medium | Content rules §4.6; `unlisted` status for anything that must not be listed. Review every description once before launch. |
| 8 | **Supabase becomes a new single point of failure** for a page that used to be static. | Medium | Static fallback snapshot (§7) + ISR means a cached page keeps serving. Read path uses the anon key only. |
| 9 | **Tool URL rot** — a tool moves and the card 404s. | Medium | `healthUrl` monitoring surfaces it; `url` is one admin edit. Add a status filter to the admin list. |
| 10 | **Admin account compromise** = full control of a public site's links (phishing vector). | Medium | Supabase Auth (rate-limited, properly hashed), one account, strong unique password, Supabase's own MFA available. Restrict what the admin can set: https-only URLs, validated schemes. |
| 11 | **Canonical duplication** between `.vercel.app` and a future custom domain. | Low | Attaching a primary domain in Vercel 308s the old URL automatically. Set `metadataBase` from an env var, never a literal. |
| 12 | **Accent colour fails contrast** if used for text. | Low | `#c96f42` ≈ 3.4:1 — non-text only. `--brand-deep #8b4423` for accent text. In the a11y gate. |
| 13 | **Middleware creep** — someone widens the matcher and the public page stops being cacheable. | Low | Matcher is `['/admin/:path*']` with a comment explaining why. Watch the Lighthouse score; a sudden TTFB regression is the tell. |
| 14 | Vercel/Render free-tier limits. | Low | Hub traffic is trivial and mostly static. Revisit only if it changes. |

**Deliberately not treated as risks:** CORS (no cross-origin requests — plain anchors), DNS (none until you own a domain), cross-app session sharing (explicitly not a goal), HSTS inheritance (only a concern under rewrites, which are rejected).

---

## 13. Future evolution

Each phase attaches at a named seam. **None is implemented now.**

**Phase 2 — Operational.** Click counts via `/go/[toolId]` → a `tool_clicks` table. Health history → `tool_health_checks`, a cron, an uptime sparkline. Simple feedback form → a `feedback` table. *Seam: Supabase already exists; these are new tables, not new infrastructure.*

**Phase 3 — Custom domain and subdomains.** §8's five-step upgrade. *Seam: the registry's `url` field. No hub code changes.*

**Phase 4 — Commercial SaaS.** Visitor accounts (Supabase Auth is already a dependency), Stripe, per-customer entitlements, private tools. *Seam: `getPublishedTools()` gains a viewer argument; RLS gains a policy. The card and grid components do not change.*

**Phase 5 — Enterprise.** SSO/MFA, organisations, RBAC/ABAC, audit logs — and note Vantage has already built much of this shape, so it is a port rather than a discovery. *Seam: Supabase Auth → enterprise IdP; the `tools` table gains an `entitlements` join.*

**Phase 6 — AI gateway.** If tools should stop holding their own provider keys, a gateway becomes a **separate service** the tools call — not something the hub proxies. The hub stays a catalog. *Seam: a `gateway` field per tool, and the tools' own env vars.*

The ordering rule: **each phase must be justified by something that actually happened** — a real cost problem, a real customer, a real compliance requirement. Not by the roadmap's existence.

---

## 14. Files to create

All new; there is no existing repository.

```
ai-tools-hub/
├─ next.config.ts                    # security headers (ported from Vantage)
├─ .env.example                      # documents vars; NEVER commit .env.local
├─ supabase/
│  ├─ migrations/0001_tools.sql      # table + checks + RLS + index
│  └─ seed.sql                       # the three tools
└─ src/
   ├─ middleware.ts                  # ⚠ matcher = ['/admin/:path*'] ONLY
   ├─ app/
   │  ├─ layout.tsx                  # Inter, metadata, no-flash theme script
   │  ├─ globals.css                 # ported "Field" tokens + @theme inline
   │  ├─ page.tsx                    # catalog (server, revalidate 60)
   │  ├─ robots.ts  ├─ sitemap.ts  ├─ opengraph-image.tsx
   │  ├─ about/page.tsx
   │  ├─ tools/[slug]/page.tsx       # SEO surface + generateStaticParams
   │  ├─ api/health/route.ts         # cached, SSRF-guarded
   │  └─ admin/
   │     ├─ layout.tsx               # noindex
   │     ├─ page.tsx                 # list all tools
   │     ├─ actions.ts               # Server Actions, service-role client
   │     ├─ login/page.tsx
   │     └─ tools/[id]/page.tsx      # create/edit form
   ├─ components/
   │  ├─ ToolCard.tsx  ├─ ToolGrid.tsx
   │  ├─ SearchAndFilter.tsx         # the only stateful client component
   │  ├─ CategoryChips.tsx  ├─ AccessBadge.tsx
   │  ├─ HealthDot.tsx  ├─ ThemeToggle.tsx  ├─ Header.tsx
   └─ lib/
      ├─ types.ts                    # Tool, ToolStatus, ToolAccess
      ├─ registry.ts                 # ★ the seam — all reads go through here
      ├─ search.ts                   # normalise + multi-word AND match
      ├─ validate.ts                 # Zod schemas + SSRF URL validator
      ├─ strings.ts                  # all UI copy (i18n-ready)
      ├─ supabase/server.ts          # anon client, RSC-safe
      ├─ supabase/admin.ts           # ⚠ service-role + `import 'server-only'`
      └─ config/fallback-tools.ts    # static snapshot for Supabase outages
```

**Existing tool repos: no changes.** That is the point of this architecture. Two small config edits become necessary only *if* you later attach custom domains: Supabase Auth redirect URLs for Vantage, `APP_URL` for SparkLab.

---

## 15. Verification

**Manual matrix** (no E2E framework in MVP — for a page this size, Playwright would cost more to maintain than it catches):

```bash
npm run dev                      # local
npx @lhci/cli autorun            # or Lighthouse in Chrome DevTools
grep -rE "SERVICE_ROLE|ANTHROPIC|sk-|sk_live" .next/static/   # must be empty
```

1. **Search:** empty → all; `assess` → Vantage only; `hr assess` → matches; `zzz` → no-match state + Clear works.
2. **Filter:** each chip; chip + query together; `All` resets.
3. **Launch:** click a card → correct tool, new tab, hub keeps its filter. Middle-click and ⌘-click behave. `planned` card is not clickable.
4. **Admin:** log in → add a tool → it appears on `/` within seconds with no deploy → edit it → delete it. Log out → `/admin` redirects.
5. **Security:** run the grep gate; attempt an anon write in the Supabase SQL editor (must fail); check response headers; feed the health validator `http://`, `127.0.0.1`, `169.254.169.254`.
6. **Keyboard only:** unplug the mouse and complete a full browse-and-launch.
7. **Screen reader:** VoiceOver or NVDA — card names include "opens in new tab"; result count is announced.
8. **Responsive:** 320 / 375 / 768 / 1024 / 1440 in DevTools, then one real iOS and one real Android device.
9. **No-JS:** disable JavaScript — grid renders, links work.
10. **Production:** repeat 1, 3 and 5 on the deployed URL after launch.

---

## Open items (non-blocking; resolve during build)

1. **Is Vantage's `/signup` genuinely open?** It exists alongside `/invite/callback`. Determines whether the badge reads `invite-only` or `sign-in`. Check by loading it signed-out.
2. **Does SparkLab expose `/api/health` publicly and unauthenticated?** `render.yaml` sets it as the health check path, but confirm it answers without a session before wiring it to `healthUrl`.
3. **Hub name and wordmark.** The mock uses "AI Tools". Vantage is Azerconnect-branded; decide whether the hub carries that branding, given it is now public and indexed.
4. **Does Render's free tier support custom domains with automatic certs?** Only matters at the subdomain upgrade. If not, SparkLab stays on `onrender.com` and the hybrid is the honest answer.

---

# 16. Implementation record — what changed, and why

The plan above was written before any code existed. Building it surfaced five
things that changed a decision. Recorded here so the document stays truthful
rather than aspirational.

### 16.1 Next.js pinned to 16.3.6, not 16.2.9

§10 said pin 16.2.9 to match Vantage. `npm audit` on the fresh scaffold
reported a **critical** advisory set against 16.2.9, fixed in 16.3.6. Two of
them bear directly on this design:

- *Middleware / proxy bypass in App Router applications* — the `/admin` gate.
- *Unauthenticated disclosure of internal Server Function endpoints* — admin
  CRUD runs on Server Actions.

Also in the set: unauthenticated RCE on Windows-hosted servers, SSRF in
rewrites via attacker-controlled destination hostname, and cache confusion on
requests with bodies. Matching a sibling app's version was never worth this;
16.3.6 audits clean.

**This also applies to Vantage**, which runs 16.2.9 in production with
Supabase middleware auth. Worth upgrading there.

### 16.2 `middleware.ts` → `proxy.ts`

Next 16.3 deprecates the `middleware` file convention in favour of `proxy`.
Migrated. The matcher is unchanged and still `['/admin/:path*']`.

### 16.3 `?q=` moved from the server to the client

§4.3 had the homepage read `searchParams` for the deep link. Reading
`searchParams` in a server component **opts the route into dynamic rendering**
— the first build produced `ƒ /` rather than `○ /`, silently discarding the
static, cookie-free delivery that §6.2 treats as load-bearing. The query is now
read client-side in an effect. Nothing is lost: with JavaScript disabled there
is no filtering to restore, and the full grid is already in the HTML.

**The lesson worth keeping:** "is this page static?" is a build-output fact
(`○` vs `ƒ`), not an intention. Check the route table after any change to a
public page.

### 16.4 Both defence-in-depth claims were tested, not assumed

- `server-only` on the admin client: a routed client component importing it
  makes the build **exit 1** with `'server-only' cannot be imported from a
  Client Component module`. Verified.
- The admin gate: `/admin` and `/admin/tools/new` return **307 → /admin/login**
  when signed out.

A first attempt at the `server-only` test was wrong — the probe lived in
`src/app/_probe/`, and a leading underscore makes a folder *private* in the App
Router, so it was never compiled and the build passed misleadingly. Worth
remembering when testing build-time guards.

### 16.5 Accessibility: two token failures inherited from Vantage

§11 flagged `--brand` as unsafe for text. Computing every token pair found two
further failures, in **both** themes:

| Token | Was | Now | Requirement |
|---|---|---|---|
| `--faint` | 3.45:1 light / 3.89:1 dark | 4.95 / 5.06 | 4.5:1 — it labels category and destination host, which is real text |
| control borders | 1.43:1 / 1.58:1 | 3.64 / 3.03 via new `--control-border` | WCAG 1.4.11, 3:1 for operable components |

`--line-strong` stays hairline for dividers and non-interactive badge outlines,
where 1.4.11 does not apply. Since both values came from Vantage's palette,
**Vantage very likely has the same two failures.**

### 16.6 The health probe was quietly becoming the keep-warm cron we rejected

Measured: SparkLab's `/api/health` answers in **~21 s** cold, because Render's
free tier sleeps after ~15 minutes idle. A probe does not observe that state —
it *causes* a wake, and the 3 s timeout aborts long before the answer arrives.
At the planned 5-minute TTL, a steadily-visited hub would have held the
instance awake continuously, burning the ~750 free instance-hours/month that
§9's "show status, don't keep warm" decision was specifically protecting.

TTL raised to 30 minutes. The badge stays useful for tools that do not sleep,
and the route can no longer act as an accidental cron.

### 16.7 Open items resolved against production

| Item | Answer |
|---|---|
| Is Vantage's `/signup` open? | **No.** It loads, but the page says "Invite only" / "invitation". The `invite-only` badge is correct. |
| Does SparkLab's `/api/health` answer unauthenticated? | **Yes** — `{"ok":true}`, HTTP 200, in ~21 s cold. Safe to wire up. |
| Is Vantage really un-embeddable? | **Yes**, confirmed on the live response, not just in source: `X-Frame-Options: DENY` plus CSP `frame-ancestors 'none'`. |

Still open: the hub's public-facing name and wordmark, and whether Render's
free tier supports custom domains with automatic certificates (only matters at
the subdomain upgrade).
