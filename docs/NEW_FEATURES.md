# One.Simple — New Features

**Status:** planned, not started · **Estimated:** ~9 working days across four phases
**Updated:** 23 September 2026

Three feature requests that extend the hub well beyond its original shape. The
*why* behind the current architecture is in [DESIGN.md](DESIGN.md); the path to
getting what exists today deployed is in
[DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md). This document covers what comes
after.

---

## What these features change

Taken together, they overturn three of the original architecture's load-bearing
properties. That is worth stating up front rather than discovering mid-build.

| Original property | What changes | Why |
|---|---|---|
| "The hub makes zero model calls and holds zero provider keys" | It now calls Claude and stores a provider key | The AI assistant |
| "No visitor accounts, ever, in MVP" | Staff sign in to reach the assistant | Assistant is staff-only |
| English only, one route per page | Three locales, every route prerendered three times | Full trilingual, including tool content |

**The public catalog stays exactly as it is** — static, cookie-free,
accountless, indexed. Everything new is additive and sits beside it. That
boundary is the single most important constraint in this plan.

### Decisions taken

| Decision | Choice |
|---|---|
| Brand name | **One.Simple** |
| Admin account setup | Invite link; you set your own password |
| AI model and keys | **Admin-configurable** in the panel |
| Assistant access | **Staff only** (@azerconnect.az) |
| Languages | **Everything**, including tool names, taglines and descriptions |
| Staff sign-in | **Either** magic link or password |
| Theme editor scope | Colours, logo and brand name |

---

## 1. Branding — One.Simple on Azerconnect's design system

### The real brand values

Extracted from SparkLab's source, where the comments state these were sampled
from the official wordmark rather than approximated:

| Token | Hex | Role |
|---|---|---|
| Logo blue | `#044176` | Exact wordmark blue; used only in the accent gradient |
| Primary blue | `#0F3C76` | Buttons, links, focus rings — the colour that reads as "Azerconnect" |
| Primary blue dark | `#0A2C58` | Hover |
| Blue tint | `#E2EFFF` | Light fills |
| Leaf green | `#356D1B` | Exact logo green; secondary brand colour |
| Navy | `#092649` | Headings, dark buttons |
| Ink | `#15263F` | Body text |
| Ink dim / faint | `#4a5a72` / `#8b97a8` | Secondary / tertiary text |
| Line / line-mid | `#dde4ee` / `#c7d3e4` | Borders |
| Paper / paper2 | `#FFFFFF` / `#F0F4FB` | Surfaces |
| Canvas | `#E7EEF8` | App background — cool light blue, surfaces stay white |
| Success / warning | `#1f9e57` / `#c47a00` | Semantic; these survive rebrands |

**Type: Manrope** (400–800), described in SparkLab's own source comment as "the
closest match to Azerconnect's corporate typeface (Mark Pro, which is
proprietary)". Loaded through `next/font/google`, which self-hosts at build time
— so no runtime request to Google and no CSP `font-src` change.

**Shape:** `4px` structural radius, **2px borders** as the primary device,
shadows used sparingly and long/low-opacity. The signature element is a
blue→green gradient rule: `linear-gradient(90deg, #044176, #356D1B)`.

### The wordmark

SparkLab's lockup is `sparklab` in navy + `.azerconnect` in leaf green — one
typeface, two tones, lowercase, weight 900, tracking `-0.04em`. **One.Simple maps
onto it exactly:**

```
one.simple              one = #092649 navy    .simple = #356D1B leaf green
by Azerconnect Group    12px / 600 / ink-dim, 9px left margin
```

### The one real tension, and how it resolves

The original brief asked for white backgrounds, hairline borders and no
gradients. Azerconnect's system uses a light-blue canvas, 2px borders and a
gradient accent. These reconcile by **keeping the Google-simple structure and
adopting Azerconnect's colour, type and shape**:

- Canvas `#E7EEF8` with white card surfaces — Azerconnect's own pattern, and it
  still reads calm and near-white.
- 2px control borders, which also *help*: they push control-border contrast
  comfortably past WCAG 1.4.11.
- The blue→green rule appears **once per page**, above the title. Not repeated,
  not decorative.
- No hero, no imagery, no clutter. The catalog still gets out of the way.

> **Contrast must be re-verified from scratch after the swap.** The current
> palette was corrected during the last build after two *measured* AA failures.
> A wholesale token replacement invalidates every one of those measurements.

### Files

`src/app/globals.css` (token values) · `src/app/layout.tsx` (Manrope, metadata,
`viewport.themeColor`, the `NO_FLASH` key) · `src/components/Header.tsx`
(wordmark) · `src/lib/strings.ts` (brand copy).

Because **100% of token consumption is inline `style={{ color: "var(--x)" }}`**
— verified, with zero use of the Tailwind token classes — changing the values in
`globals.css` re-skins the entire app with no component edits.

Two pieces of debt to clear while here: the `@theme inline` block is dead code,
and `--brand`, `--brand-light` and `--brand-50` are defined but consumed by
nothing. The re-skin is the moment to use the brand blue properly rather than
carry dead tokens forward.

---

## 2. Admin panel

### 2.1 Roles and invites

Authorization today is an `ADMIN_EMAILS` env var, checked in `src/lib/auth.ts`
and deliberately duplicated in `src/lib/supabase/middleware.ts`. That stays as
the **bootstrap** — a super admin defined outside the database cannot be removed
by anyone who compromises the database.

A new `admin_users` table layers on top:

| Column | Notes |
|---|---|
| `email` | primary key, lowercased |
| `role` | `super_admin` \| `admin` |
| `invited_by`, `invited_at`, `accepted_at` | audit trail |
| `active` | soft disable without losing history |

Authorization becomes **`SUPER_ADMIN_EMAILS` env var OR an active `admin_users`
row**. The env var wins and cannot be revoked through the UI. An empty allowlist
and an unreachable database both resolve to "nobody is an admin" — the existing
fail-closed behaviour is preserved exactly.

**Your account:** `kamranka@azerconnect.az` goes in `SUPER_ADMIN_EMAILS`, and
Supabase's `inviteUserByEmail` sends a one-time link from which you set your own
password. No password is ever generated, emailed, logged, or seen by anyone else.
This is the same pattern Vantage already uses (`/invite/callback`).

Super admins invite further admins from `/admin/team`. An ordinary admin manages
tools and the knowledge base but cannot touch roles, theme or AI settings.

### 2.2 Theme editor — `/admin/design`

A `site_settings` table, single row:

```ts
{
  brandName: string              // "One.Simple"
  wordmarkPrimary: string        // "one"
  wordmarkAccent: string         // ".simple"
  attribution: string            // "by Azerconnect Group"
  tagline: Record<Locale, string>
  logoUrl: string | null
  theme: {
    light: Record<TokenName, Hex>
    dark:  Record<TokenName, Hex>
  }
}
```

**Rendering it without breaking static delivery.** The root layout reads settings
server-side and injects `<style>:root{--brand:#…}</style>`. Values are baked into
the ISR snapshot and busted by `revalidatePath("/")` on save — the same mechanism
the tool registry already uses. A *per-visitor* or cookie-driven theme would not
be compatible with static rendering, which is precisely why it is out of scope.

The existing CSP already permits this: `style-src 'self' 'unsafe-inline'`.

**Two mandatory security controls:**

1. **No free-form CSS.** Only token names from a fixed allowlist, only values
   matching `^#[0-9a-fA-F]{6}$`. Anything else is rejected at the schema. This is
   what stops `</style><script>` and every variant of it.
2. **A contrast gate.** The editor computes WCAG ratios live and **refuses to
   save** a palette where a text token falls below 4.5:1 on its surface, or a
   control border below 3:1. The maths and the token-to-usage mapping already
   exist from the last build's accessibility fixes. Without this gate, a
   well-meaning colour change silently reintroduces the failures just fixed.

**Logo upload** goes to Supabase Storage: MIME allowlist, 512 KB cap, and **SVG
rejected by default** — an SVG can carry script, and raster covers the need. Adds
`https://*.supabase.co` to CSP `img-src`.

**Keep in sync or the theme half-applies:** `viewport.themeColor` currently
hardcodes `#ffffff`/`#111111`, and the `NO_FLASH` script hardcodes `hub-theme`.

### 2.3 Knowledge base — `/admin/knowledge`

`kb_articles`: `id`, `slug`, `title_i18n` jsonb, `body_i18n` jsonb, `tags`,
`status`, `sort_order`, timestamps. Markdown in a plain textarea — no rich-text
editor, no CMS.

---

## 3. AI assistant

### 3.1 Access and routing

Staff only. `/[locale]/assistant` is a dynamic, authenticated route; the catalog
is untouched and stays static, public and accountless.

Sign-in offers **both** magic link and password, restricted to `@azerconnect.az`:

- App-level check on the email **before** calling Supabase.
- A database trigger on `auth.users` rejecting non-matching domains — defence in
  depth, because the app check alone is one refactor away from being bypassed.

**The proxy matcher has to widen.** It is currently `["/admin/:path*"]`, and the
source calls it the most important line in the repository, because a Supabase
session refresh in front of the catalog would destroy its static delivery. It
becomes:

```ts
matcher: ["/admin/:path*", "/(en|az|ru)/assistant/:path*"]
```

Still explicitly enumerated, still nowhere near the catalog or tool pages. After
this change, verify `/`, `/[locale]` and `/[locale]/tools/[slug]` are still `○`
in the build output.

### 3.2 Provider configuration — `/admin/ai`

Keys and models are admin-managed. An `ai_settings` table:

| Field | Notes |
|---|---|
| `provider` | `anthropic` initially |
| `model` | dropdown — default **`claude-opus-5`**; also `claude-sonnet-5`, `claude-haiku-4-5` |
| `api_key_encrypted` | AES-256-GCM, key from `SETTINGS_ENCRYPTION_KEY` env |
| `api_key_last4` | display only |
| `enabled` | kill switch |
| `monthly_budget_usd`, `spend_this_month` | hard cap |
| `system_prompt_extra` | optional admin steering |

**Be clear-eyed about the key.** A provider key in the database is only as safe
as the service-role key plus the encryption key. Controls: encrypted at rest,
decrypted only in server code, **never** returned to any client (the UI shows
`sk-ant-…` plus last four), never logged, excluded from error messages. An
env-var key remains supported and takes precedence — if you would rather not
store it in the database at all, that path stays open.

Spend is tracked per request from the API's `usage` field. At the monthly cap the
assistant disables itself and says so, rather than continuing to spend.

### 3.3 How answers are produced

The official `@anthropic-ai/sdk`, streaming, from a server route. No vector
database, no embeddings, no RAG framework.

For a knowledge base this size, do what SparkLab already does: inject the
published articles wholesale into the system prompt and let **prompt caching**
carry the cost. The KB is a stable prefix so it caches; the question goes after
the last cache breakpoint. Revisit only past roughly 50k tokens — and say so in
the code rather than discovering it later.

The system prompt carries the brand voice, the live tool catalog (name, tagline,
category, access rules, URL) so the assistant routes people correctly, the KB,
and an instruction to answer in the language of the question.

**Prompt injection.** User questions are untrusted. Reuse SparkLab's own
`INJECTION_GUARD` pattern — delimit the untrusted span and instruct the model to
treat everything inside as data, never as instructions. That pattern is already
proven in your codebase; there is no reason to invent a second one.

**Abuse and cost controls**, even staff-only: per-user rate limit (~20
questions/hour) in Postgres, input length cap, `max_tokens` cap, the monthly
budget kill switch, no cross-session conversation persistence.

### 3.4 Scope

The assistant answers about the tools and the knowledge base, and declines
politely otherwise. A staff-only assistant that answers anything is a
general-purpose chatbot on your budget; scoping it is what keeps it useful and
affordable.

---

## 4. Trilingual — EN / AZ / RU

The largest structural change, because it touches every route.

### 4.1 Routing, without losing static rendering

Per-request locale detection conflicts with static delivery for the same reason
cookies do. The answer is **locale-segmented routes**, all prerendered:

```
/                        → 308 redirect to /en   (next.config.ts, no runtime cost)
/en, /az, /ru            catalog, prerendered per locale
/[locale]/tools/[slug]   detail, prerendered per locale
/[locale]/about
/[locale]/assistant      dynamic, staff-gated
```

`generateStaticParams` returns the three locales, giving three statically
delivered, separately indexable sites. Add `hreflang` alternates plus
`x-default → /en`, and list all three in the sitemap. This is *better* for SEO
than one page with a client-side switcher, not merely equivalent.

Files move under `src/app/[locale]/`. The language switcher is a plain link set —
no JavaScript, so it works with JS disabled like the rest of the page.

### 4.2 Content model

JSONB columns on `tools` rather than a translations table: one row per tool, one
write per save, trivial fallback.

```sql
alter table public.tools
  add column name_i18n        jsonb not null default '{}'::jsonb,
  add column tagline_i18n     jsonb not null default '{}'::jsonb,
  add column description_i18n jsonb not null default '{}'::jsonb;
```

The existing `name` / `tagline` / `description` stay as the base English value,
making the fallback chain **requested locale → English → base column**. That
matters: an untranslated tool must still render a complete card, never a blank
one.

Categories get their own small table (`key` PK, `label_i18n`, `sort_order`) so a
category translated once is translated everywhere rather than drifting per tool.
An unknown key displays verbatim.

UI chrome: `src/lib/strings.ts` becomes `strings[locale]`. It is already a clean
single seam for public copy — but **the admin surface bypasses it entirely**,
with hardcoded literals in every admin page, action and zod message. Admin stays
English-only in this phase; a deliberate scope cut, not an oversight.

### 4.3 Admin data entry

The tool form grows an EN/AZ/RU tab strip over the three translatable fields.
English required; AZ and RU optional and falling back. The admin list flags which
translations are missing, so gaps are visible rather than silent.

---

## 5. Implementation order

Sequenced so nothing is built twice. i18n moves every route, so it lands before
the assistant that would otherwise have to move with it.

### Phase A — Rebrand *(~1.5 days)*

1. Azerconnect tokens into `globals.css`; Manrope via `next/font/google`.
2. One.Simple wordmark in `Header.tsx`; blue→green accent rule.
3. 4px radius, 2px control borders; wire up or delete the dead `--brand*` tokens.
4. Update `viewport.themeColor`, metadata, `strings.ts`.
5. **Re-run the contrast audit across every token pair, both themes.**

*Gate:* build clean, `/` still `○` static, zero contrast failures.

### Phase B — Admin roles, invites, theme editor *(~2 days)*

6. Migration `0003`: `admin_users`, `site_settings`.
7. `SUPER_ADMIN_EMAILS` bootstrap; extend `src/lib/auth.ts` with roles.
8. `/admin/team` — invite via `inviteUserByEmail`, list, deactivate.
9. `/admin/design` — token editor, live preview, **contrast gate**, logo upload.
10. Root layout injects the theme; `revalidatePath` on save.
11. Add an admin nav — there is none today, and three sections need one.

*Gate:* invite yourself end to end; change a colour and watch it reach the public
page within seconds; confirm a failing-contrast palette cannot be saved.

### Phase C — Trilingual *(~2.5 days)*

12. Migration `0004`: i18n columns, `categories` table.
13. Move routes under `src/app/[locale]/`; `generateStaticParams`; `/` redirect.
14. `strings[locale]`; language switcher; `hreflang`; sitemap × 3.
15. Tool form translation tabs; missing-translation indicators.

*Gate:* all three locales prerendered and `○`; a missing AZ translation falls
back to English rather than rendering blank.

### Phase D — Knowledge base and assistant *(~3 days)*

16. Migration `0005`: `kb_articles`, `ai_settings`, `assistant_usage`.
17. `/admin/knowledge` CRUD; `/admin/ai` settings with the encrypted key.
18. Staff auth: magic link + password, `@azerconnect.az` enforced in the app
    **and** by a database trigger. Widen the proxy matcher — and only that far.
19. `/api/assistant` — streaming, prompt caching on the KB, `INJECTION_GUARD`,
    rate limit, budget cap.
20. `/[locale]/assistant` chat UI.

*Gate:* ask a question in each language and get a correct, on-scope answer citing
the KB; confirm the rate limit and the budget cap both actually stop it.

**Total ≈ 9 working days.**

---

## 6. Acceptance criteria

**Branding**
- [ ] Wordmark renders `one` navy + `.simple` leaf green, Manrope, with attribution.
- [ ] Every text token ≥ 4.5:1 and every control border ≥ 3:1, both themes, measured.
- [ ] The blue→green rule appears once per page, not as repeated decoration.

**Admin**
- [ ] An invite to `kamranka@azerconnect.az` lands; the link sets a password you chose.
- [ ] A super admin can invite an admin; an admin cannot reach `/admin/team`, `/admin/design` or `/admin/ai`.
- [ ] Deleting every `admin_users` row does not lock out `SUPER_ADMIN_EMAILS`.
- [ ] A colour change appears publicly within seconds, with no deploy.
- [ ] A palette failing AA is **refused**, naming the offending pair.
- [ ] A non-hex value, an unknown token name, and a `</style>` payload are all rejected.

**Assistant**
- [ ] Signed out, `/[locale]/assistant` redirects to sign-in; the catalog is unaffected.
- [ ] A non-`@azerconnect.az` address is refused by the app **and** by the trigger.
- [ ] Questions in EN, AZ and RU each get an answer in that language.
- [ ] Answers use KB content and link to the right tool.
- [ ] "Ignore your instructions and…" inside a question is treated as data.
- [ ] Rate limit returns a clear message, not a stack trace; the budget cap disables cleanly.
- [ ] The API key never appears in any response, client bundle, or log.

**Trilingual**
- [ ] `/en`, `/az`, `/ru` all build as `○` static.
- [ ] `hreflang` and `x-default` correct; sitemap lists all three.
- [ ] A tool with no AZ translation renders complete English content in the AZ locale.

**Unchanged invariants**
- [ ] `/` and every catalog route remain static and cookie-free.
- [ ] The proxy matcher lists only `/admin` and `/[locale]/assistant`.
- [ ] `grep -rlE "SERVICE_ROLE|service_role|ANTHROPIC|sk-ant|ENCRYPTION_KEY" .next/static/` returns **0**.
- [ ] `npm test` passes; SSRF and search suites still green.

---

## 7. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | Provider API key in the database | **Critical** | AES-256-GCM at rest, server-only decryption, never returned or logged, env-var path preserved |
| 2 | Theme editor as a CSS injection vector | **Critical** | Fixed token allowlist + strict hex regex; no free-form CSS at any level |
| 3 | Theme editor silently breaking accessibility | High | Contrast gate blocks the save; this is why free CSS was declined |
| 4 | Proxy matcher creep killing static delivery | High | Exactly two path families; check `○` vs `ƒ` in the build output every time |
| 5 | Prompt injection through user questions | High | `INJECTION_GUARD` delimiters, tight scope, KB is admin-authored |
| 6 | AI spend, even staff-only | High | Per-user rate limit, token caps, monthly budget kill switch, prompt caching |
| 7 | SVG logo upload carrying script | High | Reject SVG by default; raster only, MIME allowlist, 512 KB cap |
| 8 | Staff auth widening into general visitor accounts | Medium | Domain enforced twice; the assistant is the only gated surface |
| 9 | Translation gaps rendering blank cards | Medium | Fallback chain, plus missing-translation indicators in the admin list |
| 10 | 3× prerendered routes slowing builds | Medium | Small catalog; measure before optimising |
| 11 | Contrast regressions from the wholesale palette swap | Medium | Full re-audit is a Phase A gate, not an afterthought |
| 12 | Admin UI English while the public site is trilingual | Low | Deliberate scope cut; the `strings.ts` seam makes it mechanical later |

---

## 8. Explicitly out of scope

Per-visitor themes · rich-text editing · vector search, embeddings or a RAG
framework · conversation history across sessions · assistant access for the
public · visitor accounts on the catalog · per-user tool entitlements ·
translating the admin UI · free-form custom CSS · providers beyond Anthropic ·
voice input.

---

## 9. Verification

```bash
npm test
npm run build
grep -rlE "SERVICE_ROLE|service_role|ANTHROPIC|sk-ant|ENCRYPTION_KEY" .next/static/ | wc -l
```

Expect both suites passing, `/en` `/az` `/ru` all `○` with admin and assistant
`ƒ`, and **0** files matching.

Then by hand: invite yourself and set a password · change a colour and watch the
public page update · attempt a failing-contrast palette and confirm refusal ·
sign in as staff and ask a question in each language · exceed the rate limit ·
confirm the catalog still renders with JavaScript disabled in all three locales.

---

## 10. Open question

**Does One.Simple replace the Azerconnect attribution, or sit under it?** This
plan assumes `one.simple` as the product name with "by Azerconnect Group"
beneath, matching SparkLab's lockup. If One.Simple is meant to stand alone — for
instance because it may become a BPO service line, which the CV Screener plan
raises as a possibility — the attribution comes out and the palette becomes a
decision rather than an inheritance. Non-blocking; a one-line change either way.
