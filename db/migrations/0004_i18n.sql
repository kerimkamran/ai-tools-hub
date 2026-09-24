-- ---------------------------------------------------------------------------
-- Phase C -- trilingual (EN / AZ / RU).
--
-- Content model: JSONB columns on the existing rows rather than a separate
-- translations table -- one row per tool, one write per save, and a trivial
-- fallback. English stays in the base columns, so an untranslated field
-- falls back to English and a card is never rendered blank:
--
--   tools.i18n = { "az": { "name", "tagline", "description", "accessNote" },
--                  "ru": { ... } }
--
-- Categories get their own small table so a category translated once is
-- translated everywhere, instead of drifting per tool. The tools.category
-- column keeps the English value, which is also the filter key.
-- ---------------------------------------------------------------------------

alter table tools
  add column if not exists i18n jsonb not null default '{}'::jsonb;

create table if not exists categories (
  name        text primary key check (char_length(name) between 1 and 40),
  i18n        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table site_settings
  add column if not exists tagline_i18n jsonb not null default '{}'::jsonb;

-- "I have built" -> "We have built". Only rewrites the tagline if it is
-- still the shipped default, so an admin's own wording is never overwritten.
update site_settings
   set tagline = 'Everything we''ve built, in one place.'
 where id = 1 and tagline = 'Everything I''ve built, in one place.';

alter table site_settings alter column tagline set default 'Everything we''ve built, in one place.';

update site_settings
   set tagline_i18n = '{
     "az": { "tagline": "Yaratdığımız hər şey, bir yerdə." },
     "ru": { "tagline": "Всё, что мы создали, — в одном месте." }
   }'::jsonb
 where id = 1 and tagline_i18n = '{}'::jsonb;

-- Starter translations for the seeded tools. Only fills rows that have no
-- translations yet -- never overwrites what an admin has entered.
update tools set i18n = '{
  "az": {
    "tagline": "Kompetensiya əsaslı qiymətləndirmə: Sİ bal verir, insan təsdiqləyir.",
    "description": "Vantage strukturlaşdırılmış, kompetensiyalara uyğunlaşdırılmış qiymətləndirmələr aparır. Hər cavab yazılı əsaslandırma ilə qiymətləndirilir və bal nəzərə alınmazdan əvvəl rəyçi onu təsdiqləyir.",
    "accessNote": "Giriş dəvətlə"
  },
  "ru": {
    "tagline": "Оценка по компетенциям: баллы ставит ИИ, подтверждает человек.",
    "description": "Vantage проводит структурированные оценки, привязанные к компетенциям. Каждый ответ оценивается с письменным обоснованием, и рецензент подтверждает каждый балл, прежде чем он будет засчитан.",
    "accessNote": "Доступ по приглашению"
  }
}'::jsonb
where id = 'vantage' and i18n = '{}'::jsonb;

update tools set i18n = '{
  "az": {
    "tagline": "İdeyaları toplayın, qiymətləndirin və yaxşılarını irəli aparın.",
    "description": "SparkLab innovasiya axınıdır: ideyanızı təqdim edin, süni intellektin köməyi ilə rəy və qiymət alın, onu qiymətləndirmə və mentorluq mərhələləri boyunca izləyin.",
    "accessNote": "Yalnız @azerconnect.az hesabları"
  },
  "ru": {
    "tagline": "Собирайте идеи, оценивайте их и продвигайте лучшие.",
    "description": "SparkLab — это конвейер инноваций: подайте идею, получите отзыв и оценку с помощью ИИ и отслеживайте её на этапах экспертизы и менторства.",
    "accessNote": "Только для учётных записей @azerconnect.az"
  }
}'::jsonb
where id = 'sparklab' and i18n = '{}'::jsonb;

update tools set i18n = '{
  "az": {
    "tagline": "Müraciətləri vəzifə tələbləri ilə tutuşdurun — sübutlar göstərilməklə.",
    "description": "Müraciəti vakansiyanın tələbləri ilə müqayisə edir və hansı tələblərin ödənildiyini, qismən ödənildiyini və ya tapılmadığını göstərir — hər qərar üçün dəstəkləyici mətn sitat gətirilir."
  },
  "ru": {
    "tagline": "Сопоставляет отклики с требованиями роли и показывает доказательства.",
    "description": "Сверяет отклик с требованиями вакансии и показывает, какие из них выполнены, выполнены частично или не найдены, — с цитатой подтверждающего текста для каждого вывода."
  }
}'::jsonb
where id = 'cv-screener' and i18n = '{}'::jsonb;

insert into categories (name, i18n) values
  ('HR', '{"az": {"label": "İnsan resursları"}, "ru": {"label": "HR"}}'::jsonb),
  ('Productivity', '{"az": {"label": "Məhsuldarlıq"}, "ru": {"label": "Продуктивность"}}'::jsonb)
on conflict (name) do nothing;
