-- Rollback de Channel Connection Flow v1. SOLO STAGING.

begin;

drop table if exists public.tenant_channel_connection_audit;
drop table if exists public.tenant_channel_connections;

commit;
