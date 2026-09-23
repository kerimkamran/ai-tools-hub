-- ---------------------------------------------------------------------------
-- Admin roles (One.Simple Phase B).
--
-- Authorization becomes "env var OR an active row": SUPER_ADMIN_EMAILS (see
-- 0004 migration note and src/lib/auth.ts) stays the bootstrap and is defined
-- OUTSIDE this table on purpose -- a super admin who compromised the database
-- could not use that access to promote themselves or anyone else, because
-- super-admin status is never read from a row here. This table holds ONLY
-- ordinary admins, invited by a super admin, who can manage the catalog but
-- not roles, theme, or (later) AI settings.
--
-- Presence in this table IS "active". Removing a row is how access is
-- revoked -- there is no separate disabled/active flag to forget to check.
-- ---------------------------------------------------------------------------

create table if not exists public.admin_users (
  email       text primary key,
  invited_by  text not null,
  created_at  timestamptz not null default now(),

  -- Stored lowercase always, checked at write time in code AND here --
  -- the same defence-in-depth the SSRF validator uses: cheap to enforce
  -- twice, expensive to get wrong once.
  constraint admin_users_email_lowercase check (email = lower(email))
);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- No SELECT/INSERT/UPDATE/DELETE policy exists for any role. With RLS
-- enabled and no permissive policy, every operation is denied to anon and
-- authenticated alike -- only the service-role key (used exclusively in
-- Server Actions, see src/lib/supabase/admin.ts) can touch this table
-- directly. Unlike `tools`, there is no public-read case here at all: who
-- administers the hub is not public information.
--
-- The one exception is the RPC below, which exposes a single boolean and
-- nothing else -- not email addresses, not who invited whom, not counts.
-- ---------------------------------------------------------------------------
alter table public.admin_users enable row level security;
alter table public.admin_users force row level security;

-- ---------------------------------------------------------------------------
-- is_admin_email(): lets edge middleware (anon key, cookie-aware, no
-- service-role access) answer "is this signed-in email an active admin?"
-- without ever reading the table directly.
--
-- SECURITY DEFINER runs as the function owner, bypassing the caller's RLS --
-- which is exactly the narrow bypass wanted here, and the ONLY thing this
-- function returns is a boolean. This is a convenience for the middleware
-- redirect UX, not the security boundary: src/lib/auth.ts's
-- requireAdmin()/getAdminOrNull() re-check authoritatively via the
-- service-role client on every admin page and Server Action, exactly as the
-- existing proxy.ts comment already requires for SUPER_ADMIN_EMAILS.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin_email(check_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users where email = lower(check_email)
  );
$$;

revoke all on function public.is_admin_email(text) from public;
grant execute on function public.is_admin_email(text) to anon, authenticated;
