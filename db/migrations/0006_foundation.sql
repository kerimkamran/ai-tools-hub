-- ---------------------------------------------------------------------------
-- Admin Panel Plan, Phase 1 -- Foundation: roles, security policy, audit log,
-- accounts. Everything later depends on these.
-- ---------------------------------------------------------------------------

-- ---- Roles ------------------------------------------------------------------
-- Super admin stays env-var only (SUPER_ADMIN_EMAILS) and is never stored.
-- admin_users now carries admin OR editor. The permission map itself lives
-- in code (src/lib/permissions.ts); only the assignment is data.
alter table admin_users
  add column if not exists role text not null default 'admin';
do $$ begin
  alter table admin_users add constraint admin_users_role_check check (role in ('admin', 'editor'));
exception when duplicate_object then null; end $$;

-- ---- Accounts ---------------------------------------------------------------
-- admin_credentials becomes the one row per account that can sign in --
-- super admins, admins, editors and staff alike. A row with no password yet
-- is an account whose setup link has not been used.
alter table admin_credentials alter column password_hash drop not null;
alter table admin_credentials
  add column if not exists display_name          text check (display_name is null or char_length(display_name) <= 80),
  add column if not exists session_version       integer not null default 1,
  add column if not exists disabled_at           timestamptz,
  add column if not exists last_sign_in_at       timestamptz,
  add column if not exists totp_secret_encrypted text,
  add column if not exists totp_enabled_at       timestamptz,
  add column if not exists totp_last_step        bigint,
  -- SHA-256 hex of each unused recovery code; a used code is removed.
  add column if not exists recovery_codes_hash   text[] not null default '{}';

-- Everyone who already has a role gets an account row (no password yet if
-- they never set one), so the Accounts list is complete from day one.
insert into admin_credentials (email)
  select email from admin_users
  on conflict (email) do nothing;
insert into admin_credentials (email)
  select email from staff_users
  on conflict (email) do nothing;

-- ---- Setup and reset links ----------------------------------------------------
alter table invite_tokens
  add column if not exists purpose text not null default 'invite';
do $$ begin
  alter table invite_tokens add constraint invite_tokens_purpose_check check (purpose in ('invite', 'reset'));
exception when duplicate_object then null; end $$;

-- ---- Security policy (one row) ---------------------------------------------------
-- Bounds are enforced here as well as in the form, so no value outside the
-- safe range can be stored by any path.
create table if not exists security_policy (
  id                   integer primary key default 1 check (id = 1),
  idle_minutes         integer not null default 60  check (idle_minutes between 5 and 480),
  absolute_hours       integer not null default 12  check (absolute_hours between 1 and 72),
  mfa_required_admins  boolean not null default false,
  lockout_threshold    integer not null default 5   check (lockout_threshold between 3 and 10),
  lockout_minutes      integer not null default 15  check (lockout_minutes between 5 and 120),
  updated_at           timestamptz not null default now(),
  updated_by           text
);
insert into security_policy (id) values (1) on conflict (id) do nothing;

-- ---- Audit log -----------------------------------------------------------------
create table if not exists audit_log (
  id       bigserial primary key,
  at       timestamptz not null default now(),
  actor    text not null,
  action   text not null,
  area     text not null,
  target   text,
  before   jsonb,
  after    jsonb
);
create index if not exists audit_log_at_idx on audit_log (at desc);
create index if not exists audit_log_actor_idx on audit_log (actor, at desc);
create index if not exists audit_log_area_idx on audit_log (area, at desc);

-- Append-only against application code. UPDATE, DELETE and TRUNCATE are
-- rejected. The one exception is scripts/prune-audit.mts, which sets the
-- transaction-local flag onesimple.audit_prune = 'on' and may then delete
-- rows older than 12 months -- nothing newer, flag or not.
--
-- Honest limit: the app's own database role owns this table, so this guards
-- against application bugs, not against someone holding DATABASE_URL (they
-- could drop the trigger). The upgrade path is a separate owner role with
-- the app granted only INSERT and SELECT.
create or replace function audit_log_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE'
     and current_setting('onesimple.audit_prune', true) = 'on'
     and old.at < now() - interval '12 months' then
    return old;
  end if;
  raise exception 'audit_log is append-only (% refused)', tg_op;
end;
$$;

drop trigger if exists audit_log_no_change on audit_log;
create trigger audit_log_no_change
  before update or delete on audit_log
  for each row execute function audit_log_guard();

drop trigger if exists audit_log_no_truncate on audit_log;
create trigger audit_log_no_truncate
  before truncate on audit_log
  for each statement execute function audit_log_guard();

-- Failed sign-ins for emails that are NOT accounts: a daily count only, so
-- anonymous traffic cannot fill the audit table.
create table if not exists auth_failures_daily (
  day    date primary key,
  count  integer not null default 0
);

-- ---- Draft status (used by the editor role) ------------------------------------
-- A private state that no public query ever returns. New tools default to it.
alter table tools drop constraint if exists tools_status_check;
alter table tools add constraint tools_status_check
  check (status in ('draft', 'published', 'planned', 'unlisted', 'archived'));
alter table tools alter column status set default 'draft';
