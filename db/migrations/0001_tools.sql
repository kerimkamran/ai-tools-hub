-- ---------------------------------------------------------------------------
-- One.Simple -- catalog registry (plain Postgres / Render)
--
-- Ported from supabase/migrations/0001_tools.sql + 0002. The table and its
-- CHECK constraints are unchanged -- those are genuine data-integrity rules,
-- not Supabase-specific. What's dropped is Row Level Security and its
-- policies: RLS existed to bound what a leaked anon key could reach over
-- Supabase's public PostgREST endpoint. Plain Postgres has no such public
-- endpoint -- this database is reachable only from this app's own
-- server-side code -- so that threat model doesn't apply, and the
-- public/private split now lives in the SQL each query writes for itself
-- (see src/lib/registry.ts: getCatalogTools() filters `status in (...)`
-- explicitly; getAllToolsForAdmin() does not).
-- ---------------------------------------------------------------------------

create table if not exists tools (
  id          text primary key,
  slug        text not null unique,
  name        text not null check (char_length(name) between 1 and 60),
  tagline     text not null check (char_length(tagline) between 1 and 80),
  description text not null default '',
  category    text not null check (char_length(category) between 1 and 40),
  tags        text[] not null default '{}',
  icon        text not null default '',
  url         text not null default '',
  health_url  text,
  access      text not null default 'sign-in'
              check (access in ('open', 'sign-in', 'invite-only')),
  access_note text,
  status      text not null default 'planned'
              check (status in ('published', 'planned', 'unlisted', 'archived')),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- A published tool must actually go somewhere -- the database-level
  -- guarantee behind "never ship a card that leads to a 404".
  constraint published_tools_need_a_url
    check (status <> 'published' or char_length(url) > 0)
);

create index if not exists tools_status_sort_idx
  on tools (status, sort_order);
create index if not exists tools_slug_idx
  on tools (slug);

create or replace function tools_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tools_set_updated_at on tools;
create trigger tools_set_updated_at
  before update on tools
  for each row execute function tools_set_updated_at();
