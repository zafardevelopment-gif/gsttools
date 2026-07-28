-- =============================================================================
-- 0013 DOWN — manual rollback for the automation surface
-- =============================================================================
-- The project has no down-migration framework (0001–0012 are forward-only), so
-- this is not applied automatically. Run it by hand in the SQL editor if 0013
-- has to be backed out.
--
-- Destructive: drops every API key and the whole ingest/idempotency history.
-- Any n8n workflow holding a key will start getting 401s immediately.
-- =============================================================================

drop function if exists public.gst_automation_rate_limit_hit(uuid, integer);

drop table if exists public."aimunim_automation_rate_limits";
drop table if exists public."aimunim_automation_ingest_log";
drop table if exists public."aimunim_automation_api_keys";

-- Kept last: dropping the flag is what actually disables the feature for the
-- app, so do it only once the tables are gone.
alter table public."aimunim_tenants"
  drop column if exists automation_enabled;
