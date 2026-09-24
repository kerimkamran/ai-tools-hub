-- ---------------------------------------------------------------------------
-- Admin Panel Plan, Phase 2 -- Content: catalog lifecycle, translations,
-- knowledge base history.
-- ---------------------------------------------------------------------------

-- ---- Catalog --------------------------------------------------------------------
alter table tools add column if not exists featured boolean not null default false;
alter table categories add column if not exists sort_order integer not null default 0;

-- Every health probe leaves a row, so the panel shows what actually happened.
create table if not exists tool_health (
  id           bigserial primary key,
  tool_id      text not null,
  checked_at   timestamptz not null default now(),
  duration_ms  integer,
  -- up | slow | timeout | error. "timeout" is labelled "possibly waking" in
  -- the panel: a timeout cannot tell a cold start from an outage.
  outcome      text not null check (outcome in ('up', 'slow', 'timeout', 'error')),
  trigger      text not null default 'probe' check (trigger in ('probe', 'manual'))
);
create index if not exists tool_health_tool_time_idx on tool_health (tool_id, checked_at desc);

-- ---- Translations: stale detection ----------------------------------------------
-- i18n_meta = { "az": { "<field>": { "src": "<hash of English at the time>",
--                                     "review": true|false } }, "ru": {...} }
-- A translation is STALE when the hash of the current English text differs
-- from `src`, and NEEDS REVIEW when `review` is true (e.g. an AI draft).
alter table tools        add column if not exists i18n_meta jsonb not null default '{}'::jsonb;
alter table kb_articles  add column if not exists i18n_meta jsonb not null default '{}'::jsonb;
alter table categories   add column if not exists i18n_meta jsonb not null default '{}'::jsonb;
alter table site_settings add column if not exists i18n_meta jsonb not null default '{}'::jsonb;

-- Same function as src/lib/source-hash.ts: first 16 hex chars of SHA-256.
create or replace function source_hash(t text) returns text
language sql immutable as $$
  select left(encode(sha256(convert_to(coalesce(t, ''), 'UTF8')), 'hex'), 16)
$$;

-- Backfill: every translation that exists today is recorded as matching the
-- English it sits beside now, so nothing is flagged stale until English
-- actually changes.
update tools t set i18n_meta = coalesce((
  select jsonb_object_agg(loc, fields)
  from (
    select loc, jsonb_object_agg(f, jsonb_build_object('src', source_hash(
             case f when 'name' then t.name when 'tagline' then t.tagline
                    when 'description' then t.description when 'accessNote' then t.access_note end),
             'review', false)) as fields
      from jsonb_each(t.i18n) as l(loc, obj), jsonb_object_keys(obj) as f
     group by loc
  ) x
), '{}'::jsonb)
where i18n_meta = '{}'::jsonb and i18n <> '{}'::jsonb;

update kb_articles a set i18n_meta = coalesce((
  select jsonb_object_agg(loc, fields)
  from (
    select loc, jsonb_object_agg(f, jsonb_build_object('src', source_hash(
             case f when 'title' then a.title when 'body' then a.body end), 'review', false)) as fields
      from jsonb_each(a.i18n) as l(loc, obj), jsonb_object_keys(obj) as f
     group by loc
  ) x
), '{}'::jsonb)
where i18n_meta = '{}'::jsonb and i18n <> '{}'::jsonb;

update categories c set i18n_meta = coalesce((
  select jsonb_object_agg(loc, jsonb_build_object('label', jsonb_build_object('src', source_hash(c.name), 'review', false)))
    from jsonb_object_keys(c.i18n) as loc
), '{}'::jsonb)
where i18n_meta = '{}'::jsonb and i18n <> '{}'::jsonb;

update site_settings s set i18n_meta = coalesce((
  select jsonb_object_agg(loc, jsonb_build_object('tagline', jsonb_build_object('src', source_hash(s.tagline), 'review', false)))
    from jsonb_object_keys(s.tagline_i18n) as loc
), '{}'::jsonb)
where i18n_meta = '{}'::jsonb and tagline_i18n <> '{}'::jsonb;

-- ---- Knowledge base history ---------------------------------------------------------
create table if not exists kb_article_versions (
  id          bigserial primary key,
  article_id  bigint not null,
  saved_at    timestamptz not null default now(),
  saved_by    text,
  title       text not null,
  body        text not null,
  i18n        jsonb not null default '{}'::jsonb,
  tags        text[] not null default '{}',
  status      text not null
);
create index if not exists kb_article_versions_article_idx on kb_article_versions (article_id, saved_at desc);

-- ---- AI calls made from the admin panel -------------------------------------------
-- Translation drafts and the KB test console go through the same budget and
-- usage table as the staff assistant; `purpose` tells them apart.
alter table assistant_requests add column if not exists purpose text not null default 'assistant';

-- Start every existing article's history with its current state.
insert into kb_article_versions (article_id, saved_at, saved_by, title, body, i18n, tags, status)
select a.id, a.updated_at, a.updated_by, a.title, a.body, a.i18n, a.tags, a.status
  from kb_articles a
 where not exists (select 1 from kb_article_versions v where v.article_id = a.id);
