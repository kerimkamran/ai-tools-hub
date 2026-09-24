-- Seed the catalog. Safe to re-run. Requires migrations through 0004 (i18n).
-- Plain Postgres (Render).
--
-- Note the wording: these descriptions are PUBLIC writing. The hub is indexed,
-- so no internal codenames, client names or department detail belongs here.

insert into tools
  (id, slug, name, tagline, description, category, tags, icon, url, health_url,
   access, access_note, status, sort_order, i18n)
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
    'invite-only', 'Access by invitation', 'published', 10,
    '{"az": {"tagline": "Kompetensiya əsaslı qiymətləndirmə: Sİ bal verir, insan təsdiqləyir.", "description": "Vantage strukturlaşdırılmış, kompetensiyalara uyğunlaşdırılmış qiymətləndirmələr aparır. Hər cavab yazılı əsaslandırma ilə qiymətləndirilir və bal nəzərə alınmazdan əvvəl rəyçi onu təsdiqləyir.", "accessNote": "Giriş dəvətlə"}, "ru": {"tagline": "Оценка по компетенциям: баллы ставит ИИ, подтверждает человек.", "description": "Vantage проводит структурированные оценки, привязанные к компетенциям. Каждый ответ оценивается с письменным обоснованием, и рецензент подтверждает каждый балл, прежде чем он будет засчитан.", "accessNote": "Доступ по приглашению"}}'::jsonb
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
    'sign-in', '@azerconnect.az accounts only', 'published', 20,
    '{"az": {"tagline": "İdeyaları toplayın, qiymətləndirin və yaxşılarını irəli aparın.", "description": "SparkLab innovasiya axınıdır: ideyanızı təqdim edin, süni intellektin köməyi ilə rəy və qiymət alın, onu qiymətləndirmə və mentorluq mərhələləri boyunca izləyin.", "accessNote": "Yalnız @azerconnect.az hesabları"}, "ru": {"tagline": "Собирайте идеи, оценивайте их и продвигайте лучшие.", "description": "SparkLab — это конвейер инноваций: подайте идею, получите отзыв и оценку с помощью ИИ и отслеживайте её на этапах экспертизы и менторства.", "accessNote": "Только для учётных записей @azerconnect.az"}}'::jsonb
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
    'sign-in', null, 'planned', 30,
    '{"az": {"tagline": "Müraciətləri vəzifə tələbləri ilə tutuşdurun — sübutlar göstərilməklə.", "description": "Müraciəti vakansiyanın tələbləri ilə müqayisə edir və hansı tələblərin ödənildiyini, qismən ödənildiyini və ya tapılmadığını göstərir — hər qərar üçün dəstəkləyici mətn sitat gətirilir."}, "ru": {"tagline": "Сопоставляет отклики с требованиями роли и показывает доказательства.", "description": "Сверяет отклик с требованиями вакансии и показывает, какие из них выполнены, выполнены частично или не найдены, — с цитатой подтверждающего текста для каждого вывода."}}'::jsonb
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
  sort_order  = excluded.sort_order,
  -- Translations an admin has already entered are never overwritten.
  i18n        = case when tools.i18n = '{}'::jsonb then excluded.i18n else tools.i18n end;
