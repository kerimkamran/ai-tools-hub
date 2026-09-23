-- Seed the catalog. Safe to re-run. Unchanged from the Supabase version
-- except the `public.` schema prefix (plain Postgres has no separate
-- `public`/`storage`/`auth` schema split to disambiguate).
--
-- Note the wording: these descriptions are PUBLIC writing. The hub is indexed,
-- so no internal codenames, client names or department detail belongs here.

insert into tools
  (id, slug, name, tagline, description, category, tags, icon, url, health_url,
   access, access_note, status, sort_order)
values
  (
    'vantage', 'vantage', 'Vantage',
    'Competency-based assessments, scored with AI and confirmed by a human.',
    'Vantage runs structured, competency-mapped assessments. Every answer is scored with a written rationale, and a reviewer confirms each score before it counts.',
    'HR',
    array['assessment','competency','hiring','scoring','recruitment'],
    '◈',
    'https://vantage-ag.vercel.app',
    null,
    'invite-only', 'Access by invitation', 'published', 10
  ),
  (
    'sparklab', 'sparklab', 'SparkLab',
    'Capture ideas, score them, and move the good ones forward.',
    'SparkLab is an innovation pipeline: submit an idea, get AI-assisted feedback and scoring, and track it through assessment and mentoring.',
    'Productivity',
    array['innovation','ideas','pipeline','mentoring'],
    '✦',
    'https://sparklab-azerconnect.onrender.com',
    'https://sparklab-azerconnect.onrender.com/api/health',
    'sign-in', '@azerconnect.az accounts only', 'published', 20
  ),
  (
    'cv-screener', 'cv-screener', 'CV Screener',
    'Match applications against role requirements, with the evidence shown.',
    'Reads an application against a vacancy''s requirements and shows which are met, partially met or not found — with the supporting text quoted for every judgement.',
    'HR',
    array['screening','cv','recruitment','requirements'],
    '◰',
    '',
    null,
    'sign-in', null, 'planned', 30
  )
on conflict (id) do update set
  slug        = excluded.slug,
  name        = excluded.name,
  tagline     = excluded.tagline,
  description = excluded.description,
  category    = excluded.category,
  tags        = excluded.tags,
  icon        = excluded.icon,
  url         = excluded.url,
  health_url  = excluded.health_url,
  access      = excluded.access,
  access_note = excluded.access_note,
  status      = excluded.status,
  sort_order  = excluded.sort_order;
