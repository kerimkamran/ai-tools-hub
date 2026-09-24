-- ---------------------------------------------------------------------------
-- Admin Panel Plan, Phase 3 -- AI governance: API connections from any
-- provider, purposes, spend caps and alerts, a daily per-user limit, ratings
-- and (opt-in) 30-day transcripts.
-- ---------------------------------------------------------------------------

create table if not exists api_connections (
  id                bigserial primary key,
  provider          text not null check (provider in ('anthropic', 'openai', 'gemini', 'azure_openai', 'mistral', 'custom')),
  label             text not null check (char_length(label) between 1 and 60),
  -- Non-secret provider fields only (organisation/project ID, endpoint,
  -- API version, header name). The key is never in here.
  config            jsonb not null default '{}'::jsonb,
  key_encrypted     text,
  key_last4         text,
  enabled           boolean not null default true,
  monthly_cap_usd   numeric(12, 2) check (monthly_cap_usd is null or monthly_cap_usd >= 0),
  spend_month       text not null default to_char(now() at time zone 'utc', 'YYYY-MM'),
  spend_usd         numeric(14, 6) not null default 0,
  created_by        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  last_used_at      timestamptz,
  last_tested_at    timestamptz,
  last_test_ok      boolean,
  last_test_message text
);

-- Which connection and model serve each purpose. ON DELETE RESTRICT is the
-- database half of "a connection in use cannot be deleted".
create table if not exists ai_purposes (
  purpose        text primary key check (purpose in ('assistant', 'translation')),
  connection_id  bigint references api_connections(id) on delete restrict,
  model          text not null,
  updated_by     text,
  updated_at     timestamptz not null default now()
);

-- Move the Phase D key into the first connection, so nothing stops working.
insert into api_connections (provider, label, key_encrypted, key_last4, created_by)
select 'anthropic', 'Anthropic', s.api_key_encrypted, s.api_key_last4, 'migration'
  from ai_settings s
 where s.id = 1 and not exists (select 1 from api_connections);

insert into ai_purposes (purpose, connection_id, model, updated_by)
select p.purpose, (select min(id) from api_connections where provider = 'anthropic'), s.model, 'migration'
  from ai_settings s, (values ('assistant'), ('translation')) as p(purpose)
 where s.id = 1
on conflict (purpose) do nothing;

-- The old columns are emptied, not dropped, so a rollback of the app code
-- still finds them; the key now lives only in api_connections.
update ai_settings set api_key_encrypted = null, api_key_last4 = null where id = 1;

alter table ai_settings add column if not exists daily_limit integer not null default 60
  check (daily_limit between 1 and 5000);
alter table ai_settings add column if not exists store_transcripts boolean not null default false;

-- Spend alerts: one row per threshold crossed per month and scope, so each
-- alert fires once and the panel can show it.
create table if not exists ai_alerts (
  id            bigserial primary key,
  month         text not null,
  scope         text not null,          -- 'budget' or 'connection:<id>'
  threshold     integer not null check (threshold in (50, 80, 100)),
  spend_usd     numeric(14, 6) not null,
  limit_usd     numeric(14, 2) not null,
  fired_at      timestamptz not null default now(),
  unique (month, scope, threshold)
);

alter table assistant_requests add column if not exists connection_id bigint;
alter table assistant_requests add column if not exists rating smallint check (rating in (-1, 1));
alter table assistant_requests add column if not exists locale text;
-- Random token handed to the browser so the asker can rate the answer.
alter table assistant_requests add column if not exists rate_token text unique;
create index if not exists assistant_requests_time_idx on assistant_requests (created_at desc);

-- Opt-in (ai_settings.store_transcripts). NOT linked to the asker: no email,
-- no request id that leads back to one. Deleted after 30 days.
create table if not exists assistant_transcripts (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  locale      text not null,
  question    text not null,
  answer      text not null,
  rating      smallint check (rating in (-1, 1)),
  -- A SECOND random token (different from assistant_requests.rate_token),
  -- so the database holds nothing that joins a transcript to a person.
  rate_token  text unique
);
create index if not exists assistant_transcripts_time_idx on assistant_transcripts (created_at desc);
