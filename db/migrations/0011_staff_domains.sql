-- ---------------------------------------------------------------------------
-- Widen the staff domain allowlist beyond @azerconnect.az, and let the
-- self-service email sign-in link (src/app/[locale]/assistant/actions.ts,
-- requestAssistantLink) reuse the SAME one-time invite_tokens flow admins
-- already use from Accounts -- no new tables. See src/lib/security-policy.ts
-- (STAFF_DOMAINS) for the app-level mirror of this constraint.
-- ---------------------------------------------------------------------------

alter table staff_users drop constraint if exists staff_users_azerconnect_only;

alter table staff_users add constraint staff_users_allowed_domains check (
  email like '%@azerconnect.az' or
  email like '%@uninet.az' or
  email like '%@ultranet.az' or
  email like '%@goldenpay.az'
);
