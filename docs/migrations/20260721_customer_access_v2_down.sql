-- Rollback for Customer Access v2.
-- This removes only the additive Staging objects introduced by the matching up migration.

begin;

drop function if exists public.platform_revoke_customer_invitation_v2(uuid, text);
drop function if exists public.platform_list_customer_invitations_v2();
drop function if exists public.platform_active_tenant_user_by_email_v2(text);
drop function if exists public.platform_consume_customer_invitation_v2(text, text, text, text);
drop function if exists public.platform_get_customer_invitation_v2(text, text);
drop function if exists public.platform_update_invitation_delivery_v2(uuid, text, text, text);
drop function if exists public.platform_create_customer_invitation_v2(text, text, text, text, text, timestamptz, text);
drop function if exists public.platform_customer_access_catalogs_v2();
drop function if exists public.platform_require_service_role_v2();

drop table if exists public.tenant_access_audit;
drop table if exists public.tenant_invitations;
drop table if exists public.tenant_users;
drop table if exists public.tenants;
drop table if exists public.platform_bots;
drop table if exists public.platform_plans;

commit;
