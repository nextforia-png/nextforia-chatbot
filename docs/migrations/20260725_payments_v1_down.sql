-- Rollback de Payments v1. SOLO STAGING.
begin;

drop function if exists public.platform_billing_admin_v1();
drop function if exists public.platform_billing_tenant_v1(text);
drop function if exists public.platform_billing_process_wompi_v1(
  text, text, text, text, text, integer, integer, text, integer, timestamptz, timestamptz, boolean
);
drop function if exists public.platform_billing_approve_bypass_v1(
  text, text, timestamptz, timestamptz, text, text
);
drop function if exists public.platform_billing_start_payment_v1(text, text, integer, text);
drop function if exists public.platform_billing_prepare_v1(text, text, text, text);
drop function if exists public.platform_billing_snapshot_v1(text);

drop table if exists public.billing_audit_log;
drop table if exists public.payment_webhook_events;
drop table if exists public.payment_transactions;
drop table if exists public.billing_contracts;

commit;
