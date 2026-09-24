-- ---------------------------------------------------------------------------
-- Admin Panel Plan, Phase 4 -- Design Studio: the published look (palette
-- for both modes + shape/type/background), a draft, version history with
-- rollback, and scheduled themes.
-- ---------------------------------------------------------------------------

-- The published look. Shape: { preset, light: {11 hex tokens}, dark: {...},
-- design: { font, radius, border, card, density, background, accentRule } }.
-- Every value is re-validated on read (src/lib/design.ts sanitizeLook), so a
-- hand edit here cannot inject CSS.
alter table site_settings add column if not exists look jsonb;

-- Backfill from the Phase B colours, adding the four structural tokens at
-- their globals.css values.
update site_settings set look = jsonb_build_object(
  'preset', 'one-simple',
  'light', jsonb_build_object('canvas', '#e7eef8', 'surface', '#ffffff', 'text', '#15263f', 'border', '#6f8aad')
           || coalesce(colors -> 'light', '{}'::jsonb),
  'dark',  jsonb_build_object('canvas', '#111111', 'surface', '#171717', 'text', '#f0f0f0', 'border', '#646464')
           || coalesce(colors -> 'dark', '{}'::jsonb),
  'design', jsonb_build_object('font', 'manrope', 'radius', 8, 'border', 1, 'card', 'outlined',
                               'density', 'comfortable', 'background', 'solid', 'accentRule', true)
) where look is null;

-- The working draft: { brand: {...}, look: {...}, savedAt, savedBy }.
alter table site_settings add column if not exists theme_draft jsonb;

-- Every publish (and rollback) leaves a version. The logo is not part of a
-- version: it is managed on its own.
create table if not exists theme_versions (
  id            bigserial primary key,
  published_at  timestamptz not null default now(),
  published_by  text,
  note          text,
  snapshot      jsonb not null   -- { brand: {...}, look: {...} }
);

insert into theme_versions (published_by, note, snapshot)
select 'migration', 'Theme before the Design Studio', jsonb_build_object(
  'brand', jsonb_build_object('brandName', brand_name, 'wordmarkPrimary', wordmark_primary,
                              'wordmarkSecondary', wordmark_secondary, 'attribution', attribution,
                              'tagline', tagline, 'taglineI18n', tagline_i18n),
  'look', look)
  from site_settings where id = 1 and not exists (select 1 from theme_versions);

-- Scheduled looks (e.g. a Novruz or New Year preset). Decided at RENDER time
-- -- public pages revalidate every 60 s, so a schedule reaches every page
-- within the minute it starts or ends, with no cron and no deploy.
create table if not exists theme_schedules (
  id          bigserial primary key,
  name        text not null check (char_length(name) between 1 and 60),
  look        jsonb not null,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  created_by  text,
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists theme_schedules_window_idx on theme_schedules (starts_at, ends_at);
