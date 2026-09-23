-- ---------------------------------------------------------------------------
-- Site settings (One.Simple Phase B) -- the theme editor's backing store.
--
-- Deliberately a single row, not a key/value table: there is exactly one
-- live theme, and a singleton with a CHECK on its primary key is simpler to
-- reason about than "there should only ever be one row" enforced in
-- application code. The `id = 1` check makes a second row impossible, not
-- merely discouraged.
--
-- Scope, matching the theme editor's stated decision ("Colours, logo and
-- brand name"): `colors` holds ONLY the six brand-role tokens Phase A
-- introduced (primary, navy, leaf, good, warning, critical) plus logo-blue,
-- for light and dark. The structural tokens that carry the actual contrast
-- guarantees -- background, surface, foreground, muted, faint, line,
-- control-border -- are NOT here and are not admin-editable in this phase.
-- Re-deriving the whole structural palette from a form is a much bigger
-- contrast-risk surface than "brand" theming implies, and it is not what
-- Phase B's build-order line asked for. See src/lib/theme-validate.ts for
-- the fixed structural constants the contrast gate checks the editable
-- tokens against.
-- ---------------------------------------------------------------------------

create table if not exists public.site_settings (
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
  logo_url            text,

  -- { "light": { "primary": "#0f3c76", ... }, "dark": { ... } }. Free-form
  -- JSONB at the column level, but never free-form in practice: every write
  -- goes through saveTheme() in src/app/admin/theme/actions.ts, which
  -- validates against a fixed token allowlist and a strict six-digit hex
  -- regex before this row is ever touched, and refuses to save anything
  -- that fails the contrast gate. The database does not re-validate this
  -- shape -- the service-role key is the only writer, and that writer is
  -- entirely our own Server Action code, not third-party input.
  colors              jsonb not null default '{}'::jsonb,

  updated_at          timestamptz not null default now(),
  updated_by          text
);

create or replace function public.site_settings_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists site_settings_set_updated_at on public.site_settings;
create trigger site_settings_set_updated_at
  before update on public.site_settings
  for each row execute function public.site_settings_set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Unlike admin_users, this table IS publicly readable -- the root layout
-- reads it (anon key, no cookies, so the catalog stays static) to render
-- brand name, wordmark and colours for every visitor. Only the service-role
-- key can write, exactly like `tools`.
-- ---------------------------------------------------------------------------
alter table public.site_settings enable row level security;
alter table public.site_settings force row level security;

drop policy if exists site_settings_public_read on public.site_settings;
create policy site_settings_public_read
  on public.site_settings
  for select
  to anon, authenticated
  using (true);

-- Seed the one row with the exact values Phase A shipped in globals.css, so
-- installing this migration changes nothing visually until an admin actually
-- opens the theme editor.
insert into public.site_settings (id, brand_name, wordmark_primary, wordmark_secondary, attribution, tagline, colors)
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

-- ---------------------------------------------------------------------------
-- Branding storage: the logo upload target.
--
-- Public bucket (the logo is shown to every visitor) with a server-enforced
-- 512 KB cap and a raster-only MIME allowlist AT THE BUCKET LEVEL -- the same
-- defence-in-depth pattern as the SSRF validator: the Server Action in
-- src/app/admin/theme/actions.ts checks this before upload, and Storage
-- itself refuses anything that slips past. SVG is deliberately absent: an
-- SVG can carry <script>, and a raster logo covers the actual need.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'branding',
  'branding',
  true,
  524288,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists branding_public_read on storage.objects;
create policy branding_public_read
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'branding');

-- No insert/update/delete policy for anon/authenticated -- uploads go
-- through the service-role client in the theme editor's Server Action only.
