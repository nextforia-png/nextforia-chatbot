-- NextforIA Payments v1.1 · Wompi automatic subscriptions.
-- SOLO STAGING. No aplicar a Producción sin aprobación explícita de Santiago.

begin;

alter table public.billing_contracts
  add column if not exists payment_source_id text,
  add column if not exists payment_source_type text,
  add column if not exists payment_source_status text,
  add column if not exists payment_source_public_data jsonb not null default '{}'::jsonb,
  add column if not exists automatic_billing_enabled boolean not null default false,
  add column if not exists last_recurring_charge_at timestamptz;

alter table public.billing_audit_log
  drop constraint if exists billing_audit_action;
alter table public.billing_audit_log
  add constraint billing_audit_action check (
    action in (
      'contract_prepared',
      'payment_started',
      'payment_source_created',
      'wompi_webhook_processed',
      'payment_bypass_approved'
    )
  );

create index if not exists billing_contracts_recurring_due_idx
  on public.billing_contracts (next_payment_date, subscription_status)
  where automatic_billing_enabled = true and payment_source_id is not null;

create or replace function public.platform_billing_snapshot_v1(p_tenant_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  result jsonb;
begin
  perform public.platform_require_service_role_v2();
  select jsonb_build_object(
    'tenant_id', c.tenant_id,
    'customer', t.company_name,
    'plan_id', c.plan_id,
    'plan_name', p.name,
    'bot_id', c.bot_id,
    'bot_name', b.name,
    'contracted_setup_price', c.contracted_setup_price,
    'contracted_monthly_price', c.contracted_monthly_price,
    'payment_provider', c.payment_provider,
    'payment_status', c.payment_status,
    'subscription_status', c.subscription_status,
    'provider_transaction_id', c.provider_transaction_id,
    'payment_source_id', c.payment_source_id,
    'payment_source_type', c.payment_source_type,
    'payment_source_status', c.payment_source_status,
    'payment_source_public_data', c.payment_source_public_data,
    'automatic_billing_enabled', c.automatic_billing_enabled,
    'provider_fee', c.provider_fee,
    'provider_fee_type', c.provider_fee_type,
    'net_amount', c.net_amount,
    'trial_start', c.trial_start,
    'trial_end', c.trial_end,
    'next_payment_date', c.next_payment_date,
    'last_recurring_charge_at', c.last_recurring_charge_at,
    'ready_for_bot_creation', c.ready_for_bot_creation,
    'bypass_reason', c.bypass_reason,
    'bypass_approved_by', c.bypass_approved_by,
    'bypass_approved_at', c.bypass_approved_at,
    'created_at', c.created_at,
    'updated_at', c.updated_at,
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tx.id,
        'payment_provider', tx.payment_provider,
        'provider_transaction_id', tx.provider_transaction_id,
        'provider_reference', tx.provider_reference,
        'kind', tx.kind,
        'payment_status', tx.payment_status,
        'amount_charged', tx.amount_charged,
        'provider_fee', tx.provider_fee,
        'provider_fee_type', tx.provider_fee_type,
        'net_amount', tx.net_amount,
        'payment_date', tx.payment_date,
        'created_at', tx.created_at
      ) order by tx.created_at desc)
      from public.payment_transactions tx where tx.tenant_id = c.tenant_id
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'action', a.action,
        'actor', a.actor,
        'metadata', a.metadata,
        'created_at', a.created_at
      ) order by a.created_at desc)
      from public.billing_audit_log a where a.tenant_id = c.tenant_id
    ), '[]'::jsonb)
  ) into result
  from public.billing_contracts c
  join public.tenants t on t.id = c.tenant_id
  join public.platform_plans p on p.id = c.plan_id
  join public.platform_bots b on b.id = c.bot_id
  where c.tenant_id = p_tenant_id;
  return result;
end;
$$;

create or replace function public.platform_billing_start_payment_v1(
  p_tenant_id text,
  p_reference text,
  p_amount integer,
  p_kind text,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  row_tx public.payment_transactions%rowtype;
  safe_kind text := coalesce(nullif(btrim(p_kind), ''), 'initial');
begin
  perform public.platform_require_service_role_v2();
  if safe_kind not in ('initial', 'monthly', 'refund') then
    raise exception 'INVALID_PAYMENT_KIND';
  end if;
  if not exists (select 1 from public.billing_contracts where tenant_id = p_tenant_id) then
    raise exception 'BILLING_NOT_FOUND';
  end if;
  if safe_kind = 'monthly' and exists (
    select 1 from public.payment_transactions
    where tenant_id = p_tenant_id and kind = 'monthly' and payment_status = 'pending'
  ) then
    raise exception 'MONTHLY_PAYMENT_ALREADY_PENDING';
  end if;
  insert into public.payment_transactions (
    tenant_id, payment_provider, provider_reference, kind, payment_status,
    amount_charged, provider_fee, provider_fee_type, net_amount
  ) values (
    p_tenant_id, 'wompi', p_reference, safe_kind, 'pending',
    p_amount, 0, 'estimated', p_amount
  ) returning * into row_tx;
  update public.billing_contracts
    set payment_status = 'pending',
        provider_transaction_id = null,
        provider_fee = 0,
        provider_fee_type = 'estimated',
        net_amount = 0,
        ready_for_bot_creation = case when safe_kind = 'initial' then false else ready_for_bot_creation end,
        updated_at = now()
    where tenant_id = p_tenant_id;
  insert into public.billing_audit_log (tenant_id, action, actor, metadata)
  values (
    p_tenant_id, 'payment_started', left(coalesce(p_actor, 'customer'), 160),
    jsonb_build_object('reference', p_reference, 'kind', safe_kind)
  );
  return to_jsonb(row_tx);
end;
$$;

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
begin
  return public.platform_billing_start_payment_v1(
    p_tenant_id,
    p_reference,
    p_amount,
    'initial',
    p_actor
  );
end;
$$;

create or replace function public.platform_billing_save_payment_source_v1(
  p_tenant_id text,
  p_payment_source_id text,
  p_payment_source_type text,
  p_payment_source_status text,
  p_payment_source_public_data jsonb,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  perform public.platform_require_service_role_v2();
  update public.billing_contracts
    set payment_source_id = left(btrim(p_payment_source_id), 180),
        payment_source_type = left(btrim(coalesce(p_payment_source_type, 'CARD')), 40),
        payment_source_status = left(btrim(coalesce(p_payment_source_status, 'AVAILABLE')), 40),
        payment_source_public_data = coalesce(p_payment_source_public_data, '{}'::jsonb),
        automatic_billing_enabled = upper(coalesce(p_payment_source_status, 'AVAILABLE')) = 'AVAILABLE',
        updated_at = now()
    where tenant_id = p_tenant_id;
  if not found then raise exception 'BILLING_NOT_FOUND'; end if;
  insert into public.billing_audit_log (tenant_id, action, actor, metadata)
  values (
    p_tenant_id, 'payment_source_created', left(coalesce(p_actor, 'customer'), 160),
    jsonb_build_object('type', p_payment_source_type, 'status', p_payment_source_status)
  );
  return public.platform_billing_snapshot_v1(p_tenant_id);
end;
$$;

create or replace function public.platform_billing_process_wompi_v1(
  p_tenant_id text,
  p_reference text,
  p_provider_transaction_id text,
  p_payment_status text,
  p_subscription_status text,
  p_amount_charged integer,
  p_provider_fee integer,
  p_provider_fee_type text,
  p_net_amount integer,
  p_payment_date timestamptz,
  p_next_payment_date timestamptz,
  p_ready_for_bot_creation boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  row_tx public.payment_transactions%rowtype;
  inserted_event_id bigint;
  resolved_subscription_status text;
  resolved_ready boolean;
begin
  perform public.platform_require_service_role_v2();
  select * into row_tx from public.payment_transactions
    where payment_provider = 'wompi' and provider_reference = p_reference
    for update;
  if row_tx.id is null then raise exception 'PAYMENT_REFERENCE_NOT_FOUND'; end if;
  if row_tx.tenant_id <> p_tenant_id then raise exception 'PAYMENT_TENANT_MISMATCH'; end if;
  if row_tx.amount_charged <> p_amount_charged then raise exception 'PAYMENT_AMOUNT_MISMATCH'; end if;

  insert into public.payment_webhook_events (
    payment_provider, provider_transaction_id, payment_status
  ) values ('wompi', p_provider_transaction_id, p_payment_status)
  on conflict (payment_provider, provider_transaction_id, payment_status) do nothing
  returning id into inserted_event_id;

  if inserted_event_id is null then
    return jsonb_build_object('duplicate', true, 'contract', public.platform_billing_snapshot_v1(p_tenant_id));
  end if;

  if row_tx.payment_status = 'paid' and p_payment_status in ('pending', 'failed') then
    return jsonb_build_object('duplicate', false, 'ignored', true, 'contract', public.platform_billing_snapshot_v1(p_tenant_id));
  end if;

  update public.payment_transactions
    set provider_transaction_id = p_provider_transaction_id,
        payment_status = p_payment_status,
        amount_charged = p_amount_charged,
        provider_fee = p_provider_fee,
        provider_fee_type = p_provider_fee_type,
        net_amount = p_net_amount,
        payment_date = p_payment_date,
        updated_at = now()
    where id = row_tx.id;

  resolved_subscription_status := coalesce(p_subscription_status, (select subscription_status from public.billing_contracts where tenant_id = p_tenant_id));
  if row_tx.kind = 'monthly' and p_payment_status = 'failed' then
    resolved_subscription_status := 'past_due';
  end if;
  resolved_ready := p_ready_for_bot_creation;
  if row_tx.kind = 'monthly' and p_payment_status = 'failed' then
    select ready_for_bot_creation into resolved_ready from public.billing_contracts where tenant_id = p_tenant_id;
  end if;

  update public.billing_contracts
    set payment_status = p_payment_status,
        subscription_status = resolved_subscription_status,
        provider_transaction_id = p_provider_transaction_id,
        provider_fee = p_provider_fee,
        provider_fee_type = p_provider_fee_type,
        net_amount = p_net_amount,
        next_payment_date = coalesce(p_next_payment_date, next_payment_date),
        last_recurring_charge_at = case when row_tx.kind = 'monthly' and p_payment_status = 'paid' then p_payment_date else last_recurring_charge_at end,
        ready_for_bot_creation = resolved_ready,
        updated_at = now()
    where tenant_id = p_tenant_id;
  if not found then raise exception 'BILLING_NOT_FOUND'; end if;

  insert into public.billing_audit_log (tenant_id, action, actor, metadata)
  values (
    p_tenant_id, 'wompi_webhook_processed', 'wompi',
    jsonb_build_object('transaction_id', p_provider_transaction_id, 'status', p_payment_status, 'kind', row_tx.kind)
  );
  return jsonb_build_object('duplicate', false, 'contract', public.platform_billing_snapshot_v1(p_tenant_id));
end;
$$;

create or replace function public.platform_billing_due_subscriptions_v1(
  p_as_of timestamptz default now(),
  p_limit integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  result jsonb;
begin
  perform public.platform_require_service_role_v2();
  select coalesce(jsonb_agg(public.platform_billing_snapshot_v1(d.tenant_id) order by d.next_payment_date), '[]'::jsonb)
    into result
  from (
    select c.tenant_id, c.next_payment_date
    from public.billing_contracts c
    where c.automatic_billing_enabled = true
      and c.payment_source_id is not null
      and c.subscription_status in ('active', 'past_due')
      and c.next_payment_date <= coalesce(p_as_of, now())
    and not exists (
      select 1 from public.payment_transactions tx
      where tx.tenant_id = c.tenant_id and tx.kind = 'monthly' and tx.payment_status = 'pending'
    )
    order by c.next_payment_date
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  ) d;
  return result;
end;
$$;

revoke all on function public.platform_billing_start_payment_v1(text, text, integer, text, text) from public, anon, authenticated;
revoke all on function public.platform_billing_start_payment_v1(text, text, integer, text) from public, anon, authenticated;
revoke all on function public.platform_billing_save_payment_source_v1(text, text, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.platform_billing_due_subscriptions_v1(timestamptz, integer) from public, anon, authenticated;

grant execute on function public.platform_billing_start_payment_v1(text, text, integer, text, text) to service_role;
grant execute on function public.platform_billing_start_payment_v1(text, text, integer, text) to service_role;
grant execute on function public.platform_billing_save_payment_source_v1(text, text, text, text, jsonb, text) to service_role;
grant execute on function public.platform_billing_due_subscriptions_v1(timestamptz, integer) to service_role;

commit;
