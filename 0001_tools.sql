-- ---------------------------------------------------------------------------
-- AI Tools Hub -- catalog registry
-- ---------------------------------------------------------------------------

create table if not exists public.tools (
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

  -- A published tool must actually go somewhere. This is the database-level
  -- guarantee behind "never ship a card that leads to a 404": a row cannot be
  -- marked published with an empty url.
  constraint published_tools_need_a_url
    check (status <> 'published' or char_length(url) > 0)
);

create index if not exists tools_status_sort_idx
  on public.tools (status, sort_order);
create index if not exists tools_slug_idx
  on public.tools (slug);

-- Keep updated_at honest without trusting the application to send it.
create or replace function public.tools_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tools_set_updated_at on public.tools;
create trigger tools_set_updated_at
  before update on public.tools
  for each row execute function public.tools_set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- This is the security boundary for the catalog -- not a check in the UI.
--
-- Read: anon and authenticated may SELECT only rows meant to be LISTED.
--       'unlisted' is deliberately NOT here. The anon key is public and
--       speaks PostgREST, so any policy that admits a status also lets
--       anyone enumerate every row with it -- which is the opposite of
--       what 'unlisted' means. Unlisted rows are resolved server-side by
--       slug (see src/lib/registry.ts), so a direct link still works while
--       the set stays unenumerable.
--       'archived' is readable by nobody but the service role.
--
-- Write: NO insert/update/delete policy exists. With RLS enabled and no
--        permissive policy, those operations are denied for every role that
--        respects RLS. Writes are therefore possible only via the
--        service-role key, which lives server-side in Server Actions.
-- ---------------------------------------------------------------------------
alter table public.tools enable row level security;
alter table public.tools force row level security;

drop policy if exists tools_public_read on public.tools;
create policy tools_public_read
  on public.tools
  for select
  to anon, authenticated
  using (status in ('published', 'planned'));
