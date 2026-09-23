# AI Tools Hub — Development Plan

**Status:** built and verified locally · 7 commits on `main` · not yet pushed, not yet deployed
**Stack:** Next.js 16.3.6 · React 19.2.4 · Tailwind v4 · TypeScript · Supabase
**Updated:** 23 September 2026

This is the execution plan. The *why* behind the architecture is in
[DESIGN.md](DESIGN.md); this document is what to do next, in order.

---

## 1. Where things stand

### Done and verified

| Area | State |
|---|---|
| Catalog page | Static (`○`, 60s ISR), cookie-free, full grid in server HTML |
| Search | Client-side, multi-word AND, diacritic + `ə`/`ı` folding, `?q=` deep link |
| Categories | Single-select chips, derived from data, never hardcoded |
| Tool cards | Icon, name, tagline, category, access badge, access note, host, health dot |
| Launch | `<a target="_blank" rel="noopener">`, `planned` renders disabled |
| Detail pages | `/tools/[slug]`, SSG + ISR, per-tool metadata |
| SEO | `robots.ts`, `sitemap.ts`, `/admin` and `/api` excluded |
| Health probe | 30-min cache, SSRF-guarded, 3s timeout, body never read |
| Admin | Supabase Auth + `ADMIN_EMAILS` allowlist, CRUD, create/edit separated |
| Security headers | CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy |
| Database | `tools` table, RLS, two migrations, seed |
| Resilience | Static fallback snapshot if Supabase is unreachable |
| Tests | `npm test` — 30 SSRF cases + search folding, ~1s, no framework |
| Dark mode | Ported "Field" tokens, no-flash script, header toggle |
| Accessibility | WCAG AA contrast verified numerically; WCAG 2.1.4 resolved |

### Known gaps, carried deliberately

| Gap | Priority | Note |
|---|---|---|
| `opengraph-image.tsx` | **P1** | Planned but not built. Link unfurls currently have no image |
| Lighthouse run | **P1** | Never executed — no Chrome CLI on this machine. Run post-deploy |
| Real-device testing | **P1** | Only emulated at 320px. Needs one real iOS + one real Android |
| `/go/[toolId]` click tracking | P2 | Deliberately excluded from MVP |
| Custom domain / subdomains | P2 | Blocked on owning a domain |
| AZ/RU locales | P2 | Copy is centralised in `strings.ts`, so it is mechanical when needed |

---

## 2. Stage 1 — Get it on GitHub *(~5 min; one step is yours)*

The repo is committed and clean on `main`. No remote is configured.

**1.1 — Authenticate.** This step cannot be automated: it needs a browser, and
credentials should not pass through a tool.

```bash
gh auth login
```

**1.2 — Create the private repo and push.**

```bash
gh repo create ai-tools-hub --private --source=. --remote=origin --push
```

**Gate:** `gh repo view --web` opens the repo and shows 7 commits.

> If `gh` is not found, reopen your terminal — it was added to your user PATH
> this session and existing shells will not have picked it up.

---

## 3. Stage 2 — Supabase *(~15 min)*

The app runs without Supabase (static fallback), but the admin UI does not.

**2.1** Create a project at supabase.com. Pick the region closest to your users.

**2.2** In the SQL editor, run in order:

1. `supabase/migrations/0001_tools.sql` — table, constraints, RLS, trigger
2. `supabase/migrations/0002_unlisted_not_enumerable.sql` — tightens the read policy
3. `supabase/seed.sql` — the three tools

**2.3 — Create your admin user by hand.** Authentication → Users → Add user.
There is no signup route in this app, on purpose.

**2.4 — Disable public signup.** Authentication → Providers → Email → uncheck
*Allow new users to sign up*.

**2.5 — Local env.** `cp .env.example .env.local`, then fill in:

| Variable | Where it comes from |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Settings → API → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → service_role · **server only** |
| `ADMIN_EMAILS` | The address from 2.3 |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` for now |

> **2.4 and `ADMIN_EMAILS` are both security controls and neither is optional.**
> Supabase accepts public signups at `/auth/v1/signup` by default, so "has a
> valid session" is a state any stranger can put themselves in. `/admin`
> requires *membership of the allowlist*, not merely a session. An empty or
> missing allowlist authorizes nobody — it does not fall open.

**Gate:** `npm run dev`, sign in at `/admin`, add a tool, see it on `/` within
seconds with no deploy. Then confirm a non-allowlisted account gets the
"No access" page rather than a redirect loop.

---

## 4. Stage 3 — Deploy to Vercel *(~10 min)*

**3.1** Import the GitHub repo at vercel.com/new. Framework auto-detects.

**3.2 — Environment variables.** Add all five from 2.5 for **Production,
Preview and Development**. Set `NEXT_PUBLIC_SITE_URL` to the assigned
`*.vercel.app` URL — `metadataBase`, `robots.txt` and `sitemap.xml` all read it,
and a wrong value here silently produces wrong canonical URLs.

**3.3** Deploy.

**Gate — run these against the deployed URL, not localhost:**

```bash
curl -sSI https://YOUR-APP.vercel.app | grep -iE "content-security-policy|x-frame-options|strict-transport"
```

- CSP present, and `script-src` has **no `unsafe-eval`**
- `/robots.txt` disallows `/admin` and `/api/`
- `/sitemap.xml` lists `/`, `/about` and each tool — and no `/admin`
- `/admin` signed out → 307 to `/admin/login`
- Cards open the right tool in a new tab

---

## 5. Stage 4 — Close the P1 gaps *(~2–3 h)*

**4.1 — OG image.** Add `src/app/opengraph-image.tsx` using `ImageResponse`.
Wordmark on the `--background` token, nothing else. Until this exists, links
shared to Slack or WhatsApp unfurl without an image.

**4.2 — Lighthouse**, against the deployed URL:

```bash
npx --yes @lhci/cli autorun --collect.url=https://YOUR-APP.vercel.app
```

Targets: ≥95 performance / accessibility / best-practices / SEO. LCP under 1.5s
on simulated 4G, CLS under 0.05 *including* after health badges resolve.

**4.3 — Real devices.** One iOS, one Android. Specifically check: no horizontal
scroll at 320px, the keyboard does **not** auto-open (autofocus is gated to
pointer-fine devices), chips scroll horizontally, and every card is tappable at
44px.

**4.4 — Screen reader.** VoiceOver or NVDA on `/`. Confirm each card's name
includes the tool, its access level, its access note and "opens in new tab", and
that changing a filter announces the new count.

**4.5 — No-JS.** Disable JavaScript. The full grid must render and every link
must work; only search and filtering are expected to stop.

---

## 6. Stage 5 — Custom domain *(when you own one)*

Blocked on acquiring a domain. No hub code changes at any step — the hostname
lives only in `NEXT_PUBLIC_SITE_URL`, and each tool's destination is a single
`url` field in the registry.

1. Add the domain in Vercel and **mark it primary** — Vercel then 308s the
   `.vercel.app` URL to it, which removes the canonical duplication for free.
2. Update `NEXT_PUBLIC_SITE_URL` and redeploy.
3. Per tool: CNAME a subdomain (`assessment`, `sparklab`) at that tool's host,
   add the custom domain in that tool's own dashboard, wait for the certificate.
4. Add the new origin to each tool's auth redirect allowlist — Supabase Auth
   Site URL / Redirect URLs for Vantage, `APP_URL` for SparkLab.
5. Edit the `url` field in `/admin`. One field per tool.
6. Reconsider same-tab launching: once tools are subdomains of one registrable
   domain, navigation reads as staying inside the product.

**One rule to write down:** never set `Domain=.yourdomain.com` on any tool's
cookie. That is the only way these tools could bleed into each other.

**Verify first:** whether Render's free tier supports custom domains with
automatic certificates. If not, SparkLab stays on `onrender.com` — a hybrid is
the honest answer for that one tool, not a failure.

---

## 7. Priorities

**P0 — blocks launch.** Stages 1–3. Everything else can follow the site being live.

**P1 — first week after launch.** OG image · Lighthouse · real-device pass ·
screen-reader pass · no-JS check.

**P2 — only when something real demands it.** Click counting via `/go/[toolId]`
(ID-keyed; **never** `/go?url=`, which is an open redirect) · health history ·
drag-to-reorder in admin · multi-select categories · AZ/RU locales · icon upload.

**Still excluded, deliberately.** Visitor accounts · iframes (impossible for
Vantage) · rewrites and proxying · favourites and personalisation · vector
search · AI gateway · audit logs · approval workflows · CMS · billing · cookie
banner.

The ordering rule: each phase must be justified by something that actually
happened — a real cost problem, a real user, a real compliance requirement —
not by the roadmap's existence.

---

## 8. Adding a tool (the routine operation)

1. Sign in at `/admin` → **Add tool**.
2. Fill the form. `id` is permanent; `slug` is the detail-page URL.
3. Save. It appears on `/` within seconds. No deploy, no code change.

**Descriptions are public writing.** The site is indexed, so no internal
codenames, client names, department detail or staging URLs. Tags ship in the
page payload too — treat them as public. A tool that must not be listed gets
`status: unlisted`: out of the catalog, sitemap and search results, direct link
still works, and not enumerable via the API.

| Status | In catalog | Clickable | In sitemap |
|---|---|---|---|
| `published` | yes | yes | yes |
| `planned` | yes, dimmed | no | yes |
| `unlisted` | no | direct link only | no |
| `archived` | no | no | no |

---

## 9. Invariants — do not break these

Each is load-bearing, and each fails *silently* if broken.

1. **`/` stays statically rendered.** Never read cookies, headers or
   `searchParams` in `src/app/page.tsx`. Check the build output after any change
   to a public page: `○` is static, `ƒ` is dynamic. An earlier version of this
   app regressed here and nothing visibly broke.
2. **`src/proxy.ts` matches `/admin` and nothing else.** Widening it puts a
   Supabase session round-trip in front of the public catalog.
3. **`src/lib/supabase/admin.ts` keeps `import "server-only"`.** It turns a
   client-side import of the service-role key into a *build error*. Verified:
   the build exits 1.
4. **The proxy is not the auth boundary.** Every admin page and Server Action
   calls `requireAdmin()` / `getAdminOrNull()` itself.
5. **`/api/health` fetches only registry URLs**, re-validated, https-only,
   private/loopback/IP hosts refused, `redirect: "manual"`, body never read.
6. **No route accepts a destination URL from a query parameter.**
7. **The page works with JavaScript disabled.**
8. **Adding a tool needs no code change.**

Regression guard before any deploy:

```bash
npm test && npm run build && grep -rlE "SUPABASE_SERVICE_ROLE_KEY|service_role|ADMIN_EMAILS" .next/static/ | wc -l
```

Expect: both suites pass, the build succeeds, and **0** files matching.

---

## 10. Risks worth tracking

| Risk | Severity | Mitigation |
|---|---|---|
| Service-role key reaching the browser | **Critical** | `server-only` import → build error. Grep gate above |
| Admin authorization regressing to authentication-only | **Critical** | `ADMIN_EMAILS` fails closed. Keep public signup disabled |
| SSRF via `healthUrl` | High | 30 cases in `tests/ssrf.test.mts`. Run on every change to `validate.ts` |
| Open redirect if click tracking is added carelessly | High | `/go/[toolId]` only, resolved server-side. Never `?url=` |
| `/` silently becoming dynamic | Medium | Check `○` vs `ƒ` in the build output |
| Public catalog leaking internal detail | Medium | Content rules in §8; review descriptions before publishing |
| Tool URL rot | Medium | Health badge surfaces it; `url` is one admin edit |
| Supabase as a new single point of failure | Medium | Static fallback + ISR keep a cached catalog serving |

---

## 11. Related work on your other apps

Two findings here apply to tools outside this repo:

- **Vantage runs Next 16.2.9**, which carries a critical advisory set including
  an App Router middleware/proxy bypass and unauthenticated disclosure of Server
  Function endpoints. Vantage uses Supabase middleware auth, so both are
  directly relevant. Upgrading to 16.3.6+ is worth scheduling.
- **Two WCAG AA contrast failures were inherited from Vantage's palette**
  (`--faint` at 3.45:1 carrying real text; interactive borders at 1.43:1 against
  the 3:1 required by WCAG 1.4.11). Vantage very likely has both. The corrected
  values are in this repo's `globals.css`.

---

## Appendix — environment notes

This machine sits behind a TLS-inspecting corporate proxy. Certificate
revocation lookups are blocked, which breaks `winget` downloads mid-transfer
(`CRYPT_E_NO_REVOCATION_CHECK`, then connection resets). Large downloads also
need retry-with-resume. MSI installers that request elevation fail with exit
code **1602** in a non-interactive shell.

Current setup, which works around all three:

| Tool | Version | Location |
|---|---|---|
| Git | 2.55.0.3 | `%LOCALAPPDATA%\Programs\Git` (winget, user scope) |
| Node | 24.19.0 | `~\tools\node` (portable zip, checksum-verified) |
| npm | 11.17.0 | bundled with Node |
| gh | 2.101.0 | `~\tools\gh_extract\bin` (portable zip) |

All three are on your **user** PATH. Shells opened before this session will not
see them — reopen the terminal.

If a download stalls again:

```bash
curl -sS -L --ssl-no-revoke --retry 8 --retry-all-errors -C - -o out.zip <url>
```

`--ssl-no-revoke` skips only the revocation lookup the proxy blocks; full
certificate-chain validation still applies.
