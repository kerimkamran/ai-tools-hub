-- ---------------------------------------------------------------------------
-- Site settings (theme editor's backing store). Ported from
-- supabase/migrations/0004_site_settings.sql, with two changes:
--
--  1. No Row Level Security -- see 0001_tools.sql's header comment for why
--     that's safe here (no public PostgREST endpoint to guard against).
--  2. No Storage bucket. Render has no equivalent to Supabase Storage, so
--     the theme editor's logo upload (src/app/admin/theme/actions.ts) now
--     stores the logo directly in `logo_url` as a `data:` URL rather than
--     uploading to object storage and storing a link. The 512KB size cap
--     and PNG/JPEG/WebP allowlist are unchanged and still enforced in the
--     Server Action before the row is ever touched; a base64-encoded 512KB
--     file is under 700KB as text, which Postgres stores in this column
--     without difficulty.
-- ---------------------------------------------------------------------------

create table if not exists site_settings (
  id                  integer primary key default 1 check (id = 1),

  brand_name          text not null default 'One.Simple'
                       check (char_length(brand_name) between 1 and 60),
  wordmark_primary    text not null default 'one'
                       check (char_length(wordmark_primary) between 1 and 20),
  wordmark_secondary  text not null default '.simple'
                       check (char_length(wordmark_secondary) between 1 and 20),
  attribution         text not null default 'by Azerconnect Group'
                       check (char_length(attribution) <= 60),
  tagline             text not null default 'Everything I''ve built, in one place.'
                       check (char_length(tagline) between 1 and 120),
  -- A data: URL (base64-encoded raster image) or null. See header comment.
  logo_url            text,

  -- { "light": { "primary": "#0f3c76", ... }, "dark": { ... } }. Free-form
  -- JSONB at the column level, but every write goes through saveTheme() in
  -- src/app/admin/theme/actions.ts, which validates against a fixed token
  -- allowlist, a strict six-digit hex regex, and the contrast gate before
  -- this row is ever touched.
  colors              jsonb not null default '{}'::jsonb,

  updated_at          timestamptz not null default now(),
  updated_by          text
);

create or replace function site_settings_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists site_settings_set_updated_at on site_settings;
create trigger site_settings_set_updated_at
  before update on site_settings
  for each row execute function site_settings_set_updated_at();

-- Seed the one row with the exact values Phase A shipped in globals.css, so
-- installing this migration changes nothing visually until an admin opens
-- the theme editor.
insert into site_settings (id, brand_name, wordmark_primary, wordmark_secondary, attribution, tagline, colors)
values (
  1,
  'One.Simple',
  'one',
  '.simple',
  'by Azerconnect Group',
  'Everything I''ve built, in one place.',
  '{
    "light": {
      "primary": "#0f3c76",
      "navy": "#092649",
      "leaf": "#356d1b",
      "logoBlue": "#044176",
      "good": "#387047",
      "warning": "#96532b",
      "critical": "#b23b3b"
    },
    "dark": {
      "primary": "#879eba",
      "navy": "#f0f0f0",
      "leaf": "#9ab68d",
      "logoBlue": "#82a0ba",
      "good": "#92b09a",
      "warning": "#c5a08a",
      "critical": "#d59393"
    }
  }'::jsonb
)
on conflict (id) do nothing;
