-- ---------------------------------------------------------------------------
-- Graham Bell home page panel: the "not an Azerconnect employee? apply"
-- message on the public home page can carry a link, set by an admin. Blank
-- (the default) means the message renders as plain text with no link.
-- ---------------------------------------------------------------------------

alter table site_settings add column if not exists careers_url text;
