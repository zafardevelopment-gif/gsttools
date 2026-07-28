-- =============================================================================
-- 0014 DOWN — manual rollback for outbound webhooks
-- =============================================================================
-- Forward-only project; run by hand if 0014 has to be backed out.
-- Destructive: drops every registered endpoint and the whole delivery history.
-- Order matters — deliveries reference both other tables.
-- =============================================================================

drop table if exists public."aimunim_automation_deliveries";
drop table if exists public."aimunim_automation_webhooks";
drop table if exists public."aimunim_automation_events";
