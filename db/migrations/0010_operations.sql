-- ---------------------------------------------------------------------------
-- Admin Panel Plan, Phase 5 -- Operations: cookie-free usage totals,
-- announcements, per-tool maintenance, backups.
-- ---------------------------------------------------------------------------

-- Daily TOTALS only. No cookies, no IP addresses, no user IDs, no query text.
create table if not exists usage_daily (
  day     date not null,
  metric  text not null check (metric in ('tool_open', 'search_empty', 'assistant_question')),
  key     text not null default '',   -- tool id for tool_open, '' otherwise
  locale  text not null default '',
  count   integer not null default 0,
  primary key (day, metric, key, locale)
);

create table if not exists announcements (
  id          bigserial primary key,
  severity    text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  text_en     text not null check (char_length(text_en) between 1 and 240),
  text_az     text not null default '' check (char_length(text_az) <= 240),
  text_ru     text not null default '' check (char_length(text_ru) <= 240),
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,
  created_by  text,
  created_at  timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index if not exists announcements_window_idx on announcements (starts_at, ends_at);

-- Maintenance mode per tool: a message (EN + optional AZ/RU) and an end
-- date. While active it replaces the health dot and the tool is not probed.
alter table tools add column if not exists maintenance_message text;
alter table tools add column if not exists maintenance_i18n jsonb not null default '{}'::jsonb;
alter table tools add column if not exists maintenance_until timestamptz;

-- Automatic "before restore" exports, so a restore can always be undone.
create table if not exists backups (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  created_by  text,
  reason      text not null,
  data        jsonb not null
);

-- Per-tool logo (raster only, validated on upload). Served by /tool-icon/<id>
-- so the catalog page itself stays small; `icon` (a glyph) is the fallback.
alter table tools add column if not exists icon_image text;

-- English-only editing: new or changed English is translated into AZ/RU
-- automatically (through the "translation" AI purpose) right after a save.
alter table ai_settings add column if not exists auto_translate boolean not null default true;

-- Article history belongs to its article: drop orphans, then enforce it.
delete from kb_article_versions v where not exists (select 1 from kb_articles a where a.id = v.article_id);
do $$ begin
  alter table kb_article_versions
    add constraint kb_article_versions_article_fk foreign key (article_id) references kb_articles(id) on delete cascade;
exception when duplicate_object then null; end $$;
