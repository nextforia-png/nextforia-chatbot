-- Rollback for Payments v1.1 recurring additions. SOLO STAGING.

begin;

drop function if exists public.platform_billing_due_subscriptions_v1(timestamptz, integer);
drop function if exists public.platform_billing_save_payment_source_v1(text, text, text, text, jsonb, text);
drop function if exists public.platform_billing_start_payment_v1(text, text, integer, text, text);
drop function if exists public.platform_billing_start_payment_v1(text, text, integer, text);

drop index if exists public.billing_contracts_recurring_due_idx;

alter table public.billing_contracts
  drop column if exists last_recurring_charge_at,
  drop column if exists automatic_billing_enabled,
  drop column if exists payment_source_public_data,
  drop column if exists payment_source_status,
  drop column if exists payment_source_type,
  drop column if exists payment_source_id;

alter table public.billing_audit_log
  drop constraint if exists billing_audit_action;
alter table public.billing_audit_log
  add constraint billing_audit_action check (
    action in ('contract_prepared', 'payment_started', 'wompi_webhook_processed', 'payment_bypass_approved')
  );

create or replace function public.platform_billing_start_payment_v1(
  p_tenant_id text,
  p_reference text,
  p_amount integer,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  row_tx public.payment_transactions%rowtype;
begin
  perform public.platform_require_service_role_v2();
  if not exists (select 1 from public.billing_contracts where tenant_id = p_tenant_id) then
    raise exception 'BILLING_NOT_FOUND';
  end if;
  insert into public.payment_transactions (
    tenant_id, payment_provider, provider_reference, kind, payment_status,
    amount_charged, provider_fee, provider_fee_type, net_amount
  ) values (
    p_tenant_id, 'wompi', p_reference, 'initial', 'pending',
    p_amount, 0, 'estimated', p_amount
  ) returning * into row_tx;
  update public.billing_contracts
    set payment_status = 'pending',
        provider_transaction_id = null,
        provider_fee = 0,
        provider_fee_type = 'estimated',
        net_amount = 0,
        ready_for_bot_creation = false,
        updated_at = now()
    where tenant_id = p_tenant_id;
  insert into public.billing_audit_log (tenant_id, action, actor, metadata)
  values (
    p_tenant_id, 'payment_started', left(coalesce(p_actor, 'customer'), 160),
    jsonb_build_object('reference', p_reference)
  );
  return to_jsonb(row_tx);
end;
$$;

revoke all on function public.platform_billing_start_payment_v1(text, text, integer, text) from public, anon, authenticated;
grant execute on function public.platform_billing_start_payment_v1(text, text, integer, text) to service_role;

commit;
