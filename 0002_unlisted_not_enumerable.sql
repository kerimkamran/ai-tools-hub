-- Tighten the public read policy.
--
-- 0001 admitted 'unlisted' so that direct links would resolve. But the anon key
-- is public and speaks PostgREST, so admitting a status also lets anyone list
-- every row carrying it:
--
--   GET /rest/v1/tools?status=eq.unlisted&select=*
--
-- which is precisely what 'unlisted' is supposed to prevent. Unlisted rows are
-- now resolved server-side by slug instead (src/lib/registry.ts), so a direct
-- link still works and the set is no longer enumerable.
--
-- Safe to run on a fresh database too: 0001 already creates this policy name.

drop policy if exists tools_public_read on public.tools;
create policy tools_public_read
  on public.tools
  for select
  to anon, authenticated
  using (status in ('published', 'planned'));
