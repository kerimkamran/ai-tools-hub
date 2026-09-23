-- ---------------------------------------------------------------------------
-- Admin authentication and roles (Render migration).
--
-- Supabase Auth previously handled BOTH of these:
--   - authentication: does this email/password pair belong to a real account
--   - authorization: is this account allowed into /admin
-- Render has no auth product, so authentication moves into this app as three
-- tables. Authorization keeps the exact model Phase B already shipped and
-- documented in src/lib/auth.ts -- this migration does not change it:
--
--   1. SUPER_ADMIN_EMAILS (an env var, not a row) is still the bootstrap.
--      Super-admin status is still never read from a database row, so a
--      super admin cannot be created, promoted, or removed by anyone who
--      only compromises the database.
--   2. admin_users is still the ordinary-admin authorization list, invited
--      by a super admin, unchanged in shape from the Supabase version.
--
-- What's new is admin_credentials (a password hash for anyone who is
-- allowed to ATTEMPT sign-in) and invite_tokens (a one-time link, since
-- Render cannot send email the way Supabase's inviteUserByEmail did -- the
-- super admin copies the link and shares it themselves; see
-- src/app/admin/team/actions.ts and src/app/admin/invite/[token]).
--
-- A row in admin_credentials means "this email can attempt to sign in with
-- a password" -- it is NOT by itself authorization. Nothing in this schema
-- lets a stranger create their own row: the only writers are the one-time
-- bootstrap script (scripts/create-super-admin.mts, run manually) and the
-- invite-accept flow, which requires a valid, unexpired, single-use token
-- that only a super admin can generate. There is deliberately no public
-- self-signup path at all -- stricter than Supabase's default-open
-- /auth/v1/signup, not looser.
-- ---------------------------------------------------------------------------

create table if not exists admin_users (
  email       text primary key,
  invited_by  text not null,
  created_at  timestamptz not null default now(),

  constraint admin_users_email_lowercase check (email = lower(email))
);

-- No foreign key to admin_users on purpose: a super admin's email is never
-- inserted into admin_users (authorization for super admins comes from the
-- SUPER_ADMIN_EMAILS env var, never a row -- see the header comment), but a
-- super admin still needs a password row here to sign in at all. A foreign
-- key would make that impossible, so admin_credentials is intentionally
-- independent of admin_users: presence here means "can attempt sign-in",
-- presence in admin_users (or the env var) means "is authorized once
-- signed in" -- two separate questions, exactly like the Supabase version
-- kept "authenticated" and "admin" separate.
create table if not exists admin_credentials (
  email           text primary key,
  password_hash   text not null,
  failed_attempts integer not null default 0,
  locked_until    timestamptz,
  created_at      timestamptz not null default now(),

  constraint admin_credentials_email_lowercase check (email = lower(email))
);

create table if not exists invite_tokens (
  -- SHA-256 hex digest of the plaintext token, never the token itself --
  -- same principle as a password hash: a leaked row must not itself grant
  -- access. The plaintext is shown to the super admin exactly once, at
  -- invite time, and never stored anywhere.
  token_hash  text primary key,
  email       text not null,
  created_by  text not null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),

  constraint invite_tokens_email_lowercase check (email = lower(email))
);

create index if not exists invite_tokens_email_idx on invite_tokens (email);
-- Cheap manual cleanup query for an operator, not an automated job:
--   delete from invite_tokens where expires_at < now();
