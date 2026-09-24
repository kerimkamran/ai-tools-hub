# One.Simple: Admin Panel Development Plan (Super Admin)

| | |
|---|---|
| **Version** | 1.3, 2026-09-24 (reviewed against the code; minimalist interface; multi-provider APIs and full account management) |
| **Owner** | kamranka@azerconnect.az (super admin) |
| **Scope** | `/admin`, both sign-in paths, and `/api/assistant`. The public catalog must stay static and cookie-free. |
| **Related** | [DESIGN.md](DESIGN.md), [NEW_FEATURES.md](NEW_FEATURES.md) |

---

## 1. Purpose

The admin panel already covers the basics: catalog, categories, knowledge base,
AI settings, theme and team. It has two roles and no record of who changed what.
This plan turns it into a governed control centre built around **10 super admin
capabilities**. Every change is permission-checked and audited, and each
capability is specific to how One.Simple actually works.

## 2. Starting point

| Area | In place today | Gap this plan closes |
|---|---|---|
| Roles | Super admin (`SUPER_ADMIN_EMAILS` env var), admin (`admin_users` row), staff (`staff_users`, assistant only) | No granular permissions, no content-only role |
| Team | One-time invite links (SHA-256 hashed; Render cannot send email). Re-inviting an existing admin gives them a new link, and using it silently overwrites their password. | No invite list or revoke. Reset and unlock only happen as a side effect of re-inviting, with no audit record and no end to existing sessions. |
| Sessions | Signed HS256 cookie lasting 30 days, issued by **both** `/admin/login` and the assistant sign-in. Removing someone from `admin_users` takes effect on their next request. Lockout after failed sign-ins. | No "sign out everywhere", sessions survive a password change, no MFA. The cookie is checked in 3 separate places (`proxy.ts`, `auth.ts`, `/api/assistant`). |
| Audit | `updated_by` on some tables | No history of who changed what |
| Catalog | CRUD, 4 statuses, sort order, categories, health dot | **No private draft state** (`planned` is public, `unlisted` opens by slug), no preview or featuring, health results not stored |
| Translations | `i18n` JSONB with English fallback | No coverage view, no detection of stale translations |
| AI | One Anthropic key (AES-256-GCM), model, on/off switch, monthly budget with automatic stop, hourly limit | Anthropic only, one key, no key test, no spend alerts, no daily limit |
| Knowledge base | CRUD, EN/AZ/RU, draft/published, tags, ordering. Assistant context is truncated at 200k characters. | No versions, test console, size warning or insights |
| Theme | 7 colour tokens × 2 modes, contrast gate, wordmark, logo | No typography, shape or background controls, no history |
| Operations | None | Analytics, announcements, maintenance, backup |

## 3. The 10 super admin capabilities

You selected all 16 options and added three of your own. They are grouped into
10 capabilities so that nothing is dropped:

| # | Capability | Covers your selections |
|---|---|---|
| 1 | Accounts | Admin team, *accounts: add, edit, save, delete* |
| 2 | Roles & Permissions | Roles & permissions |
| 3 | Security Policy | Security policy |
| 4 | Audit Log | Audit log |
| 5 | Tool Catalog | Tool lifecycle, Categories & featuring, Health monitoring |
| 6 | Translations | Translations |
| 7 | API Management (any provider) | AI provider & keys, Budget & limits, *API management: APIs from any company* |
| 8 | Knowledge & Assistant Quality | Knowledge base, Conversation insights, *assistant knowledge management* |
| 9 | Design Studio | Theme & branding, *changing design elements (surprise me)* |
| 10 | Operations | Usage analytics, Announcements & maintenance, Backup & restore |

### 1. Accounts
- **One list of every account** that can sign in: super admins, admins, editors and staff. Each shows role, status, MFA on or off, and last sign-in. Super admins set by the env var are shown locked.
- **Add:** enter an email, choose a role and save. This creates the account and a one-time setup link to copy and send, because Render cannot send email. The person sets their own password; no one sets or sees another person's password. **Bulk add staff:** paste a list of `@azerconnect.az` emails.
- **Edit and save:** display name, role, and status (active or disabled). No one can change their own role.
- **Delete:** removes the sign-in, the role and any open links, and ends every session at once. The audit history is kept. Deleting needs typed confirmation, and no one can delete themselves or an env super admin.
- **Per-account actions:** send a reset link (`purpose = 'reset'`, one-time, expiring), unlock, reset MFA (super admin only) and sign out all sessions. `inviteAdmin` no longer re-invites an existing account, as `inviteStaff` already refuses to, so a reset is always the audited reset link.
- Every change bumps `session_version` where access changes, and writes an audit row.
- *Done when:* an add → edit → disable → delete cycle is fully audited, a deleted account's cookie is rejected on its next request, and a reset link works exactly once.

### 2. Roles & Permissions
- Three roles: **super admin** (env var only), **admin**, and **editor**. An editor can create and edit *draft* items only. They cannot change an item's status or edit anything already published.
- The permission map lives in code (`src/lib/permissions.ts`), so it is versioned and reviewed. Only role *assignment* is stored in the database.
- No one can change their own role. **No UI path can ever grant super admin.**
- *Done when:* an editor's crafted publish request is rejected server-side. A static test in `npm test` fails if any exported `"use server"` function neither calls `requirePermission()` nor appears on the public allowlist: `login`, `logout`, `acceptInvite`, `assistantLogin`, `assistantLogout`. The build script becomes `npm test && next build`, so a failing test blocks deploys.

### 3. Security Policy
- **One session verifier.** `getVerifiedSession()` in `session.ts` checks the signature, `session_version`, `disabled_at`, the idle limit (default 60 min) and the absolute limit (default 12 h, measured from an `auth_time` claim) in one query. `proxy.ts`, `auth.ts` and `/api/assistant` all use it. Nothing calls `verifySessionToken` directly any more.
- **Sliding refresh.** The `/admin` proxy and `/api/assistant` re-issue the cookie, because staff never visit `/admin`. A cookie is only re-issued if its `session_version` still matches the database, so a revoked cookie is never revived.
- **"Sign out everywhere"** bumps `session_version`. So do a password change, a role change, disabling and removal.
- **MFA (TOTP)** with 10 single-use recovery codes. The secret is encrypted with `secret-box`. It is required for super admins, and the policy can also require it for all admins. MFA is enforced on the *session*, not on one form:
  - After the password step, both sign-in paths set only a short-lived pre-MFA cookie.
  - `admin_session` is issued with an `mfa` claim only after a valid code, and `/admin` requires that claim whenever the policy requires MFA.
  - Failed codes count toward the lockout, and the last used time step is stored so a code cannot be replayed.
- Lockout threshold and duration become configurable within safe bounds. The staff domain stays fixed at `@azerconnect.az` by a database CHECK, shown in the panel but not editable.
- *Done when:* a super admin's password alone, entered through the assistant sign-in, cannot open `/admin`. "Sign out everywhere" also ends `/api/assistant` sessions. `create-super-admin` is extended to clear the TOTP secret and recovery codes and to bump `session_version`, so a locked-out super admin can recover from the server.

### 4. Audit Log
- Every change records **who, what, when, target and a before/after diff**. Secret fields are redacted: an API key change is recorded as "rotated, last4 …a1b2" and never shows the value.
- Successful and failed sign-ins for known accounts are recorded. Failed attempts for unknown emails are stored as a daily count only, so anonymous traffic cannot fill the table.
- **Append-only against application code.** A trigger rejects UPDATE, DELETE and TRUNCATE. The one exception is the prune script, which may delete rows older than 12 months when a transaction-local flag is set. The app's own database role owns the table, so this guards against app bugs, not against someone holding `DATABASE_URL`. The upgrade path is a separate owner role, with the app allowed only INSERT and SELECT.
- Filter by person, area and date; export to CSV.
- *Done when:* every admin mutation writes exactly one audit row in the same transaction.

### 5. Tool Catalog
- **New private `draft` status**, the default for new tools. `getCatalogTools`, `getToolBySlug`, the sitemap and the assistant never return a draft.
- Lifecycle: draft → preview → publish, plus unlist, archive and duplicate. Publishing keeps the checks that already exist: an English name, an SSRF-safe URL, and the `published_tools_need_a_url` constraint.
- **Featured** pin and manual ordering (accessible up/down controls). Categories: create, rename, reorder and merge. A rename updates every tool in one transaction.
- **Health panel.** Each probe writes a `tool_health` row (checked at, duration, outcome), and the panel shows the latest row for each tool. "Check now" probes **one** tool, at most once every 30 minutes, so it never wakes the other sleeping Render tools or acts as a keep-warm job. Slow starts are labelled "timed out (possibly waking)", because a timeout cannot tell a cold start from an outage.
- *Done when:* a draft is unreachable from every public URL, the preview matches the public card, and a published change appears on the site within about a minute.

### 6. Translations
- A coverage dashboard for AZ and RU across tools, categories, knowledge base articles and the tagline, with a side-by-side EN | AZ | RU editor.
- **Stale detection:** each translation stores a hash of its English source. When the English text is edited, the translations are flagged "needs review".
- Optional **"Draft with AI"** using the configured key. Drafts are saved as needs-review and count against the AI budget.
- *Done when:* editing an English tagline flags both of its translations as stale.

### 7. API Management (any provider)
- **API connections from any company.** Each connection has a provider, a label, the key, and the provider's extra fields (organisation or project ID, region, endpoint, API version). It also shows status, who added it, last used and last tested.
- **Actions:** Add, Edit and save, Test connection, Enable or Disable, Set as default for a purpose, and Delete. A key is shown only by its last four characters once saved. Editing can replace it but never reveals it.
- **Provider templates** live in code (`src/lib/providers.ts`): which fields to ask for, the key format, and a cheap authenticated test call. v1 templates: Anthropic, OpenAI, Google Gemini, Azure OpenAI, Mistral and **Custom API**.
- **Custom API** takes an HTTPS base URL, which must pass the existing SSRF check (`checkPublicHttpsUrl`) with redirects never followed, plus an auth header name. Keys go in a header only, never in the URL, where they would end up in logs.
- **Purposes.** Each purpose (assistant, translation drafts) picks a connection and a model. Only providers with a built-in adapter can serve a purpose: Anthropic today, others added one at a time (about 1 day each). Keys for any provider can be stored and tested now.
- **Delete rules:** a connection in use by a purpose cannot be deleted until the purpose is moved to another connection. Deleting wipes the encrypted key, and the audit log keeps only the provider, label and last four characters.
- **Spend:** the existing on/off switch and overall monthly budget with automatic stop stay. New: an optional cap per connection, alerts at 50%, 80% and 100% shown in the panel because no email is available, and a daily per-user limit alongside the hourly one.
- If `ANTHROPIC_API_KEY` is set, it is shown read-only as "managed by environment" and takes precedence for Anthropic.
- *Done when:* add, test, edit and delete work for every template. A Custom API pointing at localhost, a private IP or a cloud metadata address is rejected. Deleting a connection in use is blocked and names the purpose. A sentinel-key test finds the key in no Server Action or route response, RSC payload, server log, audit row or export; grepping `.next/static` stays as a secondary check.

### 8. Knowledge & Assistant Quality
- Article versions with one-click restore (`kb_article_versions`), and a preview.
- **Context meter:** measures what `buildContext()` produces (catalog plus published knowledge base) against `MAX_CONTEXT_CHARS` (200k characters, about 50k tokens). It warns *before* the existing truncation cuts content off.
- **Test console:** ask the assistant, in any of the three languages, against *draft* content before publishing.
- **Insights** (see Decision 1): thumbs up/down on each answer. If text storage is switched on: unanswered questions, thumbs-down answers and top topics per language, with "create article from this question". Question and answer text are kept for 30 days, visible to super admins only.
- *Done when:* the console answers from drafts without publishing them, and stored text is deleted after 30 days.

### 9. Design Studio ("surprise me")
- **Presets:** One.Simple (default), Azerconnect Classic, High Contrast and Midnight. Apply one with a click, then fine-tune.
- **Colour:** the 7 brand tokens, plus canvas, surface, text and border, which are hardcoded today. The contrast gate is extended to cover all of them.
- **Typography:** a curated set of 3 to 4 fonts, self-hosted through `next/font`, with only the default preloaded. A font is added only after checking it renders Azerbaijani (ə ğ ı ş ç ö ü) and Cyrillic.
- **Shape and density:** corner radius (0/4/8/12 px), border weight (1/2 px), card style (flat, outlined or raised), and comfortable or compact spacing.
- **Background:** solid, soft brand gradient or subtle dot grid, generated from the palette rather than uploaded.
- **Brand:** name, two-tone wordmark, tagline in 3 languages, raster logo, a favicon generated from the logo, and an on/off switch for the accent rule.
- **Workflow:** draft → side-by-side preview (light and dark, EN/AZ/RU) → publish, with **version history and one-click rollback**. **Scheduled themes**, such as a Novruz or New Year preset, switch on and off by date (see rule 4).
- **Guardrails:** no free-form CSS or HTML, every value comes from a fixed list or is a strict hex code, and SVG uploads stay rejected.
- *Done when:* a failing palette cannot be published, rollback takes one click, a scheduled theme reaches every public page within the same minute, and the catalog still builds as static (`○`).

### 10. Operations
- **Usage analytics:** tool opens, searches that return nothing, and assistant questions per language, counted per day. Only totals are stored, with no cookies, IPs or user IDs, so the catalog stays cookie-free.
- **Announcements:** a site-wide banner in 3 languages with a severity level and start/end dates. **Maintenance mode** per tool, with a message and an end date; it overrides the health dot.
- **Backup & restore:** a JSON export of the tools, categories, knowledge base, settings and theme versions, excluding credentials, keys and the audit log. A restore is validated with the same schemas as normal saves, shows a dry-run diff and requires typed confirmation. It exports the current state automatically before applying. Render's managed Postgres backups remain the disaster-recovery layer.
- *Done when:* export, wiping a test database and restoring reproduces the catalog exactly.

## 4. Access matrix

| Capability | Super admin | Admin | Editor |
|---|:-:|:-:|:-:|
| 1 Accounts | ✓ | Staff accounts only | — |
| 2 Roles & Permissions | ✓ | — | — |
| 3 Security Policy | ✓ | Own MFA/password | Own MFA/password |
| 4 Audit Log | ✓ | — | — |
| 5 Tool Catalog | ✓ | ✓ | Drafts only |
| 6 Translations | ✓ | ✓ (except the tagline) | Drafts only |
| 7 API Management | ✓ | — | — |
| 8 Knowledge & Assistant Quality | ✓ | Knowledge base and console | Drafts only |
| 9 Design Studio | ✓ | — | — |
| 10 Operations | ✓ | Announcements, maintenance, view analytics | — |

## 5. Engineering rules

1. **Server-side checks are the only security boundary.** Every admin page and every Server Action not on the public allowlist calls `requirePermission()`.
2. **Audit in the same transaction** as the change (add a `transaction()` helper to `src/lib/db/client.ts`).
3. **Secrets never leave the server.** They are redacted in audit diffs, exports and error messages.
4. **The public catalog stays static and cookie-free.** The proxy matcher stays `["/admin/:path*"]`. Saves reach the site through `revalidatePath`, as they do today. Anything that depends on a date (scheduled themes, announcement windows, maintenance end dates) is decided when the page renders. Every public route, including `/[locale]/about` (currently fully static), uses `revalidate = 60`, so no cron job is needed.
5. **No free-form CSS, HTML or permission editing.** Admins pick values; code defines what they mean.
6. **Destructive actions** (restore, remove admin, revoke key, sign out everywhere) require typed confirmation and are audited.

## 6. Interface design: minimalist by default

Each screen shows one primary button. Every other action is collapsed into a
single action button that expands only when you point at it, focus it or tap it.

**The dynamic action button (`ActionMenu`)**
- Collapsed, it is one button: "⋯" for actions on a row, "+" for create actions.
- It expands on hover, keyboard focus or tap to show its group, for example Preview · Edit · Duplicate · Unlist · Archive on a tool row.
- Destructive actions sit last, visually separated, and still need typed confirmation.
- It is built once as `src/components/admin/ActionMenu.tsx` and reused on every screen, so the pattern stays consistent.

| Screen | Always visible | Inside the action button |
|---|---|---|
| Catalog | New tool, search | Per row: Preview, Edit, Duplicate, Feature, Unlist, Archive |
| Accounts | Add account | Per account: Edit, Reset link, Unlock, Reset MFA, Sign out, Disable, Delete |
| Knowledge base | New article | Per article: Test in console, Versions, Translate, Unpublish, Delete |
| API Management | Add connection | Per connection: Test, Edit, Set as default, Disable, Delete |
| Design Studio | Publish | Presets, Rollback, Schedule, Advanced |
| Audit Log | Filter | Export CSV |

- **Navigation.** The 10 capabilities collapse into 4 top-level items: People & security, Content, AI, and Brand & operations. Each opens its pages on hover, focus or tap. Items a role cannot use are not shown at all, and the server still checks every request.
- **Progressive disclosure.** Advanced settings (security policy bounds, Design Studio fine-tuning, spend thresholds) stay folded under "Advanced" until opened. Status is shown inline as a dot or a count; banners are kept for spend alerts and security notices.
- **Accessibility rules for the pattern:**
  - Never hover-only: every menu also opens with Enter or Space and with a tap, so keyboard and touch users can reach every action.
  - The menu stays open while the pointer moves into it and closes on Escape (WCAG 1.4.13). A short open delay of about 150 ms prevents flicker.
  - `aria-expanded` and arrow-key navigation; focus returns to the button when the menu closes.
  - Targets are at least 44 × 44 px, and icons inside a menu always have a text label.
- *Done when:* every admin screen shows at most one primary button, and keyboard-only and touch-only walkthroughs both reach every action.

## 7. Data model (migrations 0006 onward)

| Change | Purpose |
|---|---|
| `admin_users` + `role` | Roles |
| `admin_credentials` + `display_name`, `session_version`, `disabled_at`, `last_sign_in_at`, `totp_secret_encrypted`, `totp_last_step`, `recovery_codes_hash` | One row per account that can sign in, including staff and super admins: account management, revocation, MFA |
| `invite_tokens` + `purpose` (`invite` or `reset`) | Setup and reset links |
| `security_policy` (single row) | Timeouts, MFA requirement, lockout |
| `audit_log` + trigger, daily failed sign-in counts | Audit |
| `tools.status` + `draft` (new default), `tools.featured`, `tools.maintenance_*`, `categories.sort_order` | Catalog, maintenance |
| `tool_health` | Health panel |
| `kb_article_versions` | Knowledge base history |
| `api_connections` (provider, label, non-secret config, encrypted key, last four, status, cap, last used, last tested) | API connections from any provider; the key columns move here from `ai_settings` |
| `ai_purposes` (purpose, connection, model) | Which connection and model serve each purpose |
| `assistant_requests` + `connection_id`, `rating`; `assistant_transcripts` (30-day retention) | Spend per connection, insights |
| `theme_versions`, `site_settings.design`, `theme_schedules` | Design Studio |
| `announcements`, `usage_daily` | Operations |

## 8. Delivery plan

| Phase | Priority | Capabilities | Estimate | Gate |
|---|---|---|---|---|
| **1. Foundation** | P0 | 2 Roles, 3 Security, 4 Audit, 1 Accounts, plus the minimalist admin shell (4-group nav, `ActionMenu`) | 6.5 days | Permission test blocks the build; a password alone via either sign-in path cannot bypass MFA; every mutation audited; every action reachable by keyboard and touch |
| **2. Content** | P1 | 5 Catalog, 6 Translations, 8 Knowledge base (versions, console, meter) | 4 days | Drafts unreachable publicly; stale translations flagged |
| **3. AI governance** | P1 | 7 API Management (any provider), 8 Insights | 4 days | Add, test, edit and delete work for every provider template; Custom API SSRF test passes; sentinel-key test passes; alerts fire |
| **4. Brand** | P2 | 9 Design Studio | 3 days | Presets, rollback and schedules work; catalog still `○` |
| **5. Operations** | P2 | 10 Operations | 3 days | Restore round-trip exact; analytics set no cookie |

**Total: about 21 working days.** Foundation comes first because every later
capability depends on permission checks, audit rows and a single session
verifier. Adding them afterwards would mean reworking every action.

## 9. Key risks

| Risk | Mitigation |
|---|---|
| MFA bypassed through the second sign-in form | MFA enforced on the session through an `mfa` claim, not on one form |
| Revocation missing on one of the 3 cookie checks | A single shared verifier; a test signs out everywhere, then calls `/api/assistant` |
| Super admin locked out by MFA or a policy change | `create-super-admin` recovery; policy values bounded; the env var super admin can never be removed |
| Secrets leaking into responses, audit rows or exports | Redaction allowlist and the sentinel-key test |
| More stored keys means more to leak | Encrypted at rest, never shown after saving, disable or delete per connection |
| Custom API used to reach internal addresses (SSRF) | Existing `checkPublicHttpsUrl` validator, redirects never followed, key sent in a header only, test calls rate-limited |
| Deleting a key a feature depends on | Delete blocked until the purpose is moved to another connection |
| Deleting an account by mistake | Typed confirmation, no self-delete, env super admins locked, audit history kept |
| A Server Action added later without a permission check | Static test with an explicit public allowlist, run before every build |
| Privacy of stored assistant text | Off by default, 30-day retention, super admin only, notice shown on the assistant page |
| Design changes breaking accessibility | Contrast gate on every token, presets, one-click rollback |
| A restore overwriting live content | Dry-run diff, automatic export first, typed confirmation |

## 10. Out of scope

A permission-matrix editor · SSO (a future option through Microsoft Entra ID) ·
sending email (Render has none, so invites stay copy-link) · sharing stored API
keys with the catalog's tools (each tool keeps its own keys) · editors proposing changes to already-published content (this would
need a revisions table, about 1.5 extra days) · free-form CSS · per-visitor themes.

## 11. Decisions needed (not blocking)

1. **Store assistant question and answer text?** The plan assumes *yes*, switched on by a super admin with a notice on the assistant page, not linked to the asker's email, and deleted after 30 days. The alternatives are per-person opt-in, or no text at all, in which case insights are counts and thumbs ratings only.
2. **Editor role:** the plan assumes it is wanted, for drafts only. Dropping it saves about 1 day. The `draft` status stays either way, because admins need it to preview before publishing.
3. **Which provider gets the second adapter?** Keys from any company can be stored and tested from day one, but only Anthropic can power the assistant today. The plan assumes no second adapter until you name one; each takes about 1 day.
4. **Can ordinary admins manage staff accounts?** The plan assumes yes, staff only. Admin, editor and API management stay super admin only.
