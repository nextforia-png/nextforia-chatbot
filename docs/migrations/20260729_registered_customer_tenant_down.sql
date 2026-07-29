-- Remove canonical registered-tenant invitation support.
begin;

drop function if exists public.platform_create_registered_customer_invitation_v1(text, text, text, text, text, text, timestamptz, text);

commit;
