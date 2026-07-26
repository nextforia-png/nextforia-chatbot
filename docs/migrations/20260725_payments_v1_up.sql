-- NextforIA Payments v1 · Wompi Sandbox + trials/pilots auditados.
-- SOLO STAGING. No aplicar a Producción sin aprobación explícita de Santiago.
-- Depende de:
--   20260721_customer_access_v2_up.sql
--   20260722_catalogo_planes_up.sql

begin;

create table if not exists public.billing_contracts (
  tenant_id text primary key references public.tenants(id) on delete restrict,
  plan_id text not null references public.platform_plans(id),
  bot_id text not null references public.platform_bots(id),
  contracted_setup_price integer not null,
  contracted_monthly_price integer not null,
  payment_provider text not null default 'wompi',
  payment_status text not null default 'pending',
  subscription_status text,
  provider_transaction_id text,
  provider_fee integer not null default 0,
  provider_fee_type text not null default 'estimated',
  net_amount integer not null default 0,
  trial_start timestamptz,
  trial_end timestamptz,
  next_payment_date timestamptz,
  ready_for_bot_creation boolean not null default false,
  bypass_reason text,
  bypass_approved_by text,
  bypass_approved_at timestamptz,
  customer_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_contracts_prices_nonnegative check (
    contracted_setup_price >= 0 and contracted_monthly_price >= 0
    and provider_fee >= 0 and net_amount >= 0
  ),
  constraint billing_contracts_provider check (payment_provider = 'wompi'),
  constraint billing_contracts_payment_status check (
    payment_status in ('pending', 'paid', 'failed', 'refunded')
  ),
  constraint billing_contracts_subscription_status check (
    subscription_status is null
    or subscription_status in ('trial', 'active', 'past_due', 'suspended', 'cancelled', 'pilot')
  ),
  constraint billing_contracts_fee_type check (provider_fee_type in ('real', 'estimated')),
  constraint billing_contracts_trial_dates check (
    (subscription_status <> 'trial')
    or (trial_start is not null and trial_end is not null and trial_end > trial_start)
  ),
  constraint billing_contracts_bypass_audit check (
    (subscription_status not in ('trial', 'pilot'))
    or (bypass_reason is not null and bypass_approved_by is not null and bypass_approved_at is not null)
  )
);

create unique index if not exists billing_contracts_provider_transaction_uidx
  on public.billing_contracts (payment_provider, provider_transaction_id)
  where provider_transaction_id is not null;
create index if not exists billing_contracts_status_idx
  on public.billing_contracts (subscription_status, payment_status, updated_at desc);

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete restrict,
  payment_provider text not null default 'wompi',
  provider_transaction_id text,
  provider_reference text not null,
  kind text not null default 'initial',
  payment_status text not null default 'pending',
  amount_charged integer not null,
  provider_fee integer not null default 0,
  provider_fee_type text not null default 'estimated',
  net_amount integer not null default 0,
  payment_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_transactions_provider check (payment_provider = 'wompi'),
  constraint payment_transactions_kind check (kind in ('initial', 'monthly', 'refund')),
  constraint payment_transactions_status check (
    payment_status in ('pending', 'paid', 'failed', 'refunded')
  ),
  constraint payment_transactions_amounts check (
    amount_charged >= 0 and provider_fee >= 0 and net_amount >= 0
  ),
  constraint payment_transactions_fee_type check (provider_fee_type in ('real', 'estimated')),
  unique (payment_provider, provider_reference)
);

create unique index if not exists payment_transactions_provider_id_uidx
  on public.payment_transactions (payment_provider, provider_transaction_id)
  where provider_transaction_id is not null;
create index if not exists payment_transactions_tenant_created_idx
  on public.payment_transactions (tenant_id, created_at desc);

create table if not exists public.payment_webhook_events (
  id bigint generated always as identity primary key,
  payment_provider text not null default 'wompi',
  provider_transaction_id text not null,
  payment_status text not null,
  processed_at timestamptz not null default now(),
  constraint payment_webhook_events_provider check (payment_provider = 'wompi'),
  constraint payment_webhook_events_status check (
    payment_status in ('pending', 'paid', 'failed', 'refunded')
  ),
  unique (payment_provider, provider_transaction_id, payment_status)
);

create table if not exists public.billing_audit_log (
  id bigint generated always as identity primary key,
  tenant_id text not null references public.tenants(id) on delete restrict,
  action text not null,
  actor text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint billing_audit_action check (
    action in ('contract_prepared', 'payment_started', 'wompi_webhook_processed', 'payment_bypass_approved')
  )
);

create index if not exists billing_audit_tenant_created_idx
  on public.billing_audit_log (tenant_id, created_at desc);

alter table public.billing_contracts enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.payment_webhook_events enable row level security;
alter table public.billing_audit_log enable row level security;
alter table public.billing_contracts force row level security;
alter table public.payment_transactions force row level security;
alter table public.payment_webhook_events force row level security;
alter table public.billing_audit_log force row level security;

revoke all on public.billing_contracts, public.payment_transactions,
  public.payment_webhook_events, public.billing_audit_log
  from public, anon, authenticated;
grant select, insert, update on public.billing_contracts, public.payment_transactions,
  public.payment_webhook_events, public.billing_audit_log
  to service_role;
grant usage, select on sequence public.payment_webhook_events_id_seq,
  public.billing_audit_log_id_seq to service_role;

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
    'provider_fee', c.provider_fee,
    'provider_fee_type', c.provider_fee_type,
    'net_amount', c.net_amount,
    'trial_start', c.trial_start,
    'trial_end', c.trial_end,
    'next_payment_date', c.next_payment_date,
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

create or replace function public.platform_billing_prepare_v1(
  p_tenant_id text,
  p_plan_id text,
  p_bot_id text,
  p_customer_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  existing public.billing_contracts%rowtype;
  plan_row public.platform_plans%rowtype;
begin
  perform public.platform_require_service_role_v2();
  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'TENANT_NOT_FOUND';
  end if;
  select * into plan_row from public.platform_plans
    where id = p_plan_id and active for share;
  if plan_row.id is null then raise exception 'PLAN_NOT_FOUND'; end if;
  if not exists (select 1 from public.platform_bots where id = p_bot_id and active) then
    raise exception 'BOT_NOT_FOUND';
  end if;
  if plan_row.bot_id is not null and plan_row.bot_id <> p_bot_id then
    raise exception 'INVALID_PLAN_FOR_BOT';
  end if;

  select * into existing from public.billing_contracts
    where tenant_id = p_tenant_id for update;
  if existing.tenant_id is not null
    and (existing.plan_id <> p_plan_id or existing.bot_id <> p_bot_id)
    and (existing.ready_for_bot_creation or existing.subscription_status in ('active', 'trial', 'pilot'))
  then
    raise exception 'CONTRACT_CHANGE_REQUIRES_ADMIN';
  end if;

  insert into public.billing_contracts as c (
    tenant_id, plan_id, bot_id, contracted_setup_price, contracted_monthly_price,
    payment_provider, payment_status, provider_fee_type, customer_email, updated_at
  ) values (
    p_tenant_id, p_plan_id, p_bot_id, plan_row.precio_setup, plan_row.precio_mensual,
    'wompi', 'pending', 'estimated', lower(btrim(p_customer_email)), now()
  )
  on conflict (tenant_id) do update set
    plan_id = excluded.plan_id,
    bot_id = excluded.bot_id,
    contracted_setup_price = case
      when c.plan_id = excluded.plan_id and c.bot_id = excluded.bot_id
        then c.contracted_setup_price else excluded.contracted_setup_price end,
    contracted_monthly_price = case
      when c.plan_id = excluded.plan_id and c.bot_id = excluded.bot_id
        then c.contracted_monthly_price else excluded.contracted_monthly_price end,
    payment_status = case
      when c.plan_id = excluded.plan_id and c.bot_id = excluded.bot_id
        then c.payment_status else 'pending' end,
    subscription_status = case
      when c.plan_id = excluded.plan_id and c.bot_id = excluded.bot_id
        then c.subscription_status else null end,
    provider_transaction_id = case
      when c.plan_id = excluded.plan_id and c.bot_id = excluded.bot_id
        then c.provider_transaction_id else null end,
    provider_fee = case
      when c.plan_id = excluded.plan_id and c.bot_id = excluded.bot_id
        then c.provider_fee else 0 end,
    provider_fee_type = case
      when c.plan_id = excluded.plan_id and c.bot_id = excluded.bot_id
        then c.provider_fee_type else 'estimated' end,
    net_amount = case
      when c.plan_id = excluded.plan_id and c.bot_id = excluded.bot_id
        then c.net_amount else 0 end,
    next_payment_date = case
      when c.plan_id = excluded.plan_id and c.bot_id = excluded.bot_id
        then c.next_payment_date else null end,
    ready_for_bot_creation = case
      when c.plan_id = excluded.plan_id and c.bot_id = excluded.bot_id
        then c.ready_for_bot_creation else false end,
    customer_email = coalesce(excluded.customer_email, c.customer_email),
    updated_at = now();

  update public.tenants
    set plan_id = p_plan_id,
        assigned_bot_id = p_bot_id,
        precio_setup_contratado = plan_row.precio_setup,
        precio_mensual_contratado = plan_row.precio_mensual,
        plan_contratado_en = now(),
        updated_at = now()
    where id = p_tenant_id
      and (plan_id is distinct from p_plan_id or assigned_bot_id is distinct from p_bot_id);

  if existing.tenant_id is null
    or existing.plan_id <> p_plan_id or existing.bot_id <> p_bot_id
  then
    insert into public.billing_audit_log (tenant_id, action, actor, metadata)
    values (
      p_tenant_id, 'contract_prepared', 'customer',
      jsonb_build_object('plan_id', p_plan_id, 'bot_id', p_bot_id)
    );
  end if;

  return public.platform_billing_snapshot_v1(p_tenant_id);
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

create or replace function public.platform_billing_approve_bypass_v1(
  p_tenant_id text,
  p_subscription_status text,
  p_trial_start timestamptz,
  p_trial_end timestamptz,
  p_reason text,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  perform public.platform_require_service_role_v2();
  if p_subscription_status not in ('trial', 'pilot') then
    raise exception 'INVALID_BYPASS_STATUS';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 4 or btrim(coalesce(p_actor, '')) = '' then
    raise exception 'BYPASS_AUDIT_REQUIRED';
  end if;
  if p_subscription_status = 'trial'
    and (p_trial_start is null or p_trial_end is null or p_trial_end <= p_trial_start)
  then
    raise exception 'INVALID_TRIAL_DATES';
  end if;
  update public.billing_contracts
    set payment_status = 'paid',
        subscription_status = p_subscription_status,
        trial_start = case when p_subscription_status = 'trial' then p_trial_start else null end,
        trial_end = case when p_subscription_status = 'trial' then p_trial_end else null end,
        next_payment_date = case when p_subscription_status = 'trial' then p_trial_end else null end,
        ready_for_bot_creation = true,
        bypass_reason = left(btrim(p_reason), 500),
        bypass_approved_by = left(btrim(p_actor), 160),
        bypass_approved_at = now(),
        updated_at = now()
    where tenant_id = p_tenant_id;
  if not found then raise exception 'BILLING_NOT_FOUND'; end if;
  insert into public.billing_audit_log (tenant_id, action, actor, metadata)
  values (
    p_tenant_id, 'payment_bypass_approved', left(btrim(p_actor), 160),
    jsonb_build_object('subscription_status', p_subscription_status, 'reason', left(btrim(p_reason), 500))
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
    return jsonb_build_object(
      'duplicate', true,
      'contract', public.platform_billing_snapshot_v1(p_tenant_id)
    );
  end if;

  if row_tx.payment_status = 'paid' and p_payment_status in ('pending', 'failed') then
    return jsonb_build_object(
      'duplicate', false,
      'ignored', true,
      'contract', public.platform_billing_snapshot_v1(p_tenant_id)
    );
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

  update public.billing_contracts
    set payment_status = p_payment_status,
        subscription_status = coalesce(p_subscription_status, subscription_status),
        provider_transaction_id = p_provider_transaction_id,
        provider_fee = p_provider_fee,
        provider_fee_type = p_provider_fee_type,
        net_amount = p_net_amount,
        next_payment_date = p_next_payment_date,
        ready_for_bot_creation = p_ready_for_bot_creation,
        updated_at = now()
    where tenant_id = p_tenant_id;
  if not found then raise exception 'BILLING_NOT_FOUND'; end if;

  insert into public.billing_audit_log (tenant_id, action, actor, metadata)
  values (
    p_tenant_id, 'wompi_webhook_processed', 'wompi',
    jsonb_build_object('transaction_id', p_provider_transaction_id, 'status', p_payment_status)
  );
  return jsonb_build_object(
    'duplicate', false,
    'contract', public.platform_billing_snapshot_v1(p_tenant_id)
  );
end;
$$;

create or replace function public.platform_billing_tenant_v1(p_tenant_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  perform public.platform_require_service_role_v2();
  return public.platform_billing_snapshot_v1(p_tenant_id);
end;
$$;

create or replace function public.platform_billing_admin_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  result jsonb;
begin
  perform public.platform_require_service_role_v2();
  select coalesce(
    jsonb_agg(public.platform_billing_snapshot_v1(c.tenant_id) order by c.updated_at desc),
    '[]'::jsonb
  ) into result
  from public.billing_contracts c;
  return result;
end;
$$;

revoke all on function public.platform_billing_snapshot_v1(text) from public, anon, authenticated;
revoke all on function public.platform_billing_prepare_v1(text, text, text, text) from public, anon, authenticated;
revoke all on function public.platform_billing_start_payment_v1(text, text, integer, text) from public, anon, authenticated;
revoke all on function public.platform_billing_approve_bypass_v1(text, text, timestamptz, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.platform_billing_process_wompi_v1(text, text, text, text, text, integer, integer, text, integer, timestamptz, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.platform_billing_tenant_v1(text) from public, anon, authenticated;
revoke all on function public.platform_billing_admin_v1() from public, anon, authenticated;

grant execute on function public.platform_billing_snapshot_v1(text) to service_role;
grant execute on function public.platform_billing_prepare_v1(text, text, text, text) to service_role;
grant execute on function public.platform_billing_start_payment_v1(text, text, integer, text) to service_role;
grant execute on function public.platform_billing_approve_bypass_v1(text, text, timestamptz, timestamptz, text, text) to service_role;
grant execute on function public.platform_billing_process_wompi_v1(text, text, text, text, text, integer, integer, text, integer, timestamptz, timestamptz, boolean) to service_role;
grant execute on function public.platform_billing_tenant_v1(text) to service_role;
grant execute on function public.platform_billing_admin_v1() to service_role;

commit;
