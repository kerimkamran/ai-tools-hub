-- ---------------------------------------------------------------------------
-- Phase D -- staff AI assistant.
--
--   staff_users         who may use the assistant (besides admins)
--   kb_articles         the knowledge base the assistant answers from
--   ai_settings         provider / model / encrypted key / budget (one row)
--   assistant_requests  one row per question: rate limiting and spend
--
-- The public catalog reads none of these tables.
-- ---------------------------------------------------------------------------

-- Staff are invited by a super admin (Team page) and set their own password
-- through the same one-time invite link admins use -- Render cannot send
-- email, so there is no magic-link sign-in. The @azerconnect.az rule is
-- enforced TWICE: in the invite action before any write, and by this CHECK
-- constraint, so an app-level refactor alone can never widen it.
create table if not exists staff_users (
  email       text primary key,
  invited_by  text not null,
  created_at  timestamptz not null default now(),

  constraint staff_users_email_lowercase check (email = lower(email)),
  constraint staff_users_azerconnect_only check (email like '%@azerconnect.az')
);

create table if not exists kb_articles (
  id          bigserial primary key,
  title       text not null check (char_length(title) between 1 and 200),
  body        text not null default '' check (char_length(body) <= 20000),
  -- { "az": { "title", "body" }, "ru": { ... } } -- same fallback model as
  -- tools.i18n: English is the base columns.
  i18n        jsonb not null default '{}'::jsonb,
  tags        text[] not null default '{}',
  status      text not null default 'draft' check (status in ('draft', 'published')),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text
);

create index if not exists kb_articles_status_sort_idx on kb_articles (status, sort_order);

create or replace function kb_articles_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists kb_articles_set_updated_at on kb_articles;
create trigger kb_articles_set_updated_at
  before update on kb_articles
  for each row execute function kb_articles_set_updated_at();

create table if not exists ai_settings (
  id                  integer primary key default 1 check (id = 1),
  provider            text not null default 'anthropic' check (provider in ('anthropic')),
  model               text not null default 'claude-opus-5-5'
                       check (char_length(model) between 1 and 80),
  -- AES-256-GCM ciphertext (see src/lib/secret-box.ts). NEVER the plaintext,
  -- and never returned to any client -- the UI shows api_key_last4 only.
  api_key_encrypted   text,
  api_key_last4       text check (api_key_last4 is null or char_length(api_key_last4) = 4),
  enabled             boolean not null default false,
  monthly_budget_usd  numeric(10, 2) not null default 20 check (monthly_budget_usd >= 0),
  spend_month         text not null default to_char(now(), 'YYYY-MM'),
  spend_usd           numeric(14, 6) not null default 0,
  hourly_limit        integer not null default 20 check (hourly_limit between 1 and 500),
  updated_at          timestamptz not null default now(),
  updated_by          text
);

insert into ai_settings (id) values (1) on conflict (id) do nothing;

create table if not exists assistant_requests (
  id                  bigserial primary key,
  email               text not null,
  created_at          timestamptz not null default now(),
  model               text,
  status              text not null default 'started'
                       check (status in ('started', 'ok', 'error')),
  input_tokens        integer,
  output_tokens       integer,
  cache_read_tokens   integer,
  cache_write_tokens  integer,
  cost_usd            numeric(14, 6)
);

create index if not exists assistant_requests_email_time_idx
  on assistant_requests (email, created_at);
