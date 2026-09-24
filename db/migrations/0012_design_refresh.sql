-- ---------------------------------------------------------------------------
-- Carry the 2026 design refresh (src/lib/design.ts DEFAULT_DESIGN) into any
-- database whose site_settings.look.design still exactly matches the
-- original Phase 4 seed (0009_design.sql) -- i.e. nobody has published a
-- custom look from the Design Studio yet. Colours are untouched (still
-- Azerconnect's #0f3c76 / #092649 / #356d1b / #044176); only shape and type
-- move forward, and only for a database that never left the shipped
-- default. A site that HAS published its own look is never touched here --
-- this advances the untouched default, it never overwrites a real choice.
-- ---------------------------------------------------------------------------

update site_settings
   set look = jsonb_set(
     look, '{design}',
     '{"font": "inter", "radius": 12, "border": 1, "card": "raised", "density": "compact", "background": "solid", "accentRule": true}'::jsonb
   )
 where look -> 'design' = '{"font": "manrope", "radius": 8, "border": 1, "card": "outlined", "density": "comfortable", "background": "solid", "accentRule": true}'::jsonb;

update site_settings
   set theme_draft = jsonb_set(
     theme_draft, '{look,design}',
     '{"font": "inter", "radius": 12, "border": 1, "card": "raised", "density": "compact", "background": "solid", "accentRule": true}'::jsonb
   )
 where theme_draft -> 'look' -> 'design' = '{"font": "manrope", "radius": 8, "border": 1, "card": "outlined", "density": "comfortable", "background": "solid", "accentRule": true}'::jsonb;
