begin;

create extension if not exists pgcrypto;

-- Lightweight read model. Full message bodies remain exclusively in
-- conversation_logs and are fetched only after a conversation is opened.
create table if not exists public.conversation_intelligence (
  id uuid primary key default gen_random_uuid(),
  contract_version smallint not null default 1 check (contract_version = 1),
  tenant_id text not null references public.tenants(id) on delete restrict,
  conversation_id text not null check (char_length(btrim(conversation_id)) between 1 and 500),
  channel text not null check (channel ~ '^[a-z0-9][a-z0-9_-]{0,39}$'),
  channel_connection_id text,
  primary_bot_id text not null,
  active_bot_id text not null,
  customer_ref text,
  conversation_status text not null default 'open' check (conversation_status in ('open','resolved','archived')),
  outcome_type text not null default 'unknown' check (outcome_type in ('unknown','support','appointment','order','handoff','mixed')),
  outcome_status text check (outcome_status is null or outcome_status in ('potential','confirmed','paid','lost','cancelled')),
  outcome_reason text,
  outcome_updated_at timestamptz,
  first_message_at timestamptz,
  last_message_at timestamptz,
  message_count bigint not null default 0 check (message_count >= 0),
  last_message_preview text,
  last_message_direction text check (last_message_direction is null or last_message_direction in ('customer','bot','human','system')),
  needs_human boolean not null default false,
  bot_ops_conversation_key text not null check (bot_ops_conversation_key ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, channel, conversation_id),
  check (channel_connection_id is null or char_length(channel_connection_id) <= 200),
  check (primary_bot_id is null or primary_bot_id ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  check (active_bot_id is null or active_bot_id ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  check (customer_ref is null or char_length(customer_ref) <= 500),
  check (outcome_reason is null or char_length(outcome_reason) <= 500),
  check (last_message_preview is null or char_length(last_message_preview) <= 240),
  check (last_message_at is null or first_message_at is null or last_message_at >= first_message_at)
);

create index if not exists conversation_intelligence_tenant_activity_idx
  on public.conversation_intelligence (tenant_id, last_message_at desc nulls last, id desc);
create index if not exists conversation_intelligence_tenant_outcome_idx
  on public.conversation_intelligence (tenant_id, outcome_status, outcome_type, outcome_updated_at desc);
create index if not exists conversation_intelligence_tenant_route_idx
  on public.conversation_intelligence (tenant_id, active_bot_id, channel, last_message_at desc nulls last);
create index if not exists conversation_intelligence_bot_ops_idx
  on public.conversation_intelligence (tenant_id, bot_ops_conversation_key);

-- Canonical relationship to operational entities. Appointments stay in
-- appointments and current orders stay in their existing order state store;
-- this table only links them to a conversation and standardizes value state.
create table if not exists public.conversation_business_objects (
  contract_version smallint not null default 1 check (contract_version = 1),
  tenant_id text not null,
  conversation_id text not null,
  channel text not null,
  object_type text not null check (object_type in ('appointment','order')),
  object_id text not null check (char_length(btrim(object_id)) between 1 and 200),
  object_status text,
  value_status text not null check (value_status in ('potential','confirmed','paid','lost','cancelled')),
  amount_minor bigint check (amount_minor is null or amount_minor >= 0),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  is_primary boolean not null default false,
  source_event_id text not null check (char_length(btrim(source_event_id)) between 1 and 500),
  occurred_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, object_type, object_id),
  constraint conversation_business_objects_conversation_fk
    foreign key (tenant_id, channel, conversation_id)
    references public.conversation_intelligence (tenant_id, channel, conversation_id)
    on delete restrict,
  check ((amount_minor is null and currency is null) or (amount_minor is not null and currency is not null)),
  check (object_status is null or char_length(object_status) <= 80)
);

create index if not exists conversation_business_objects_conversation_idx
  on public.conversation_business_objects (tenant_id, channel, conversation_id, occurred_at desc);
create index if not exists conversation_business_objects_value_idx
  on public.conversation_business_objects (tenant_id, value_status, object_type, occurred_at desc);
create unique index if not exists conversation_business_objects_source_event_idx
  on public.conversation_business_objects (tenant_id, source_event_id);
create unique index if not exists conversation_business_objects_primary_idx
  on public.conversation_business_objects (tenant_id, channel, conversation_id)
  where is_primary;

alter table public.conversation_intelligence enable row level security;
alter table public.conversation_intelligence force row level security;
alter table public.conversation_business_objects enable row level security;
alter table public.conversation_business_objects force row level security;

drop policy if exists conversation_intelligence_service_role on public.conversation_intelligence;
create policy conversation_intelligence_service_role on public.conversation_intelligence
  for all to service_role using (true) with check (true);
drop policy if exists conversation_business_objects_service_role on public.conversation_business_objects;
create policy conversation_business_objects_service_role on public.conversation_business_objects
  for all to service_role using (true) with check (true);

revoke all on public.conversation_intelligence, public.conversation_business_objects from public, anon, authenticated;
grant select, insert, update on public.conversation_intelligence, public.conversation_business_objects to service_role;

create or replace function public.conversation_value_transition_allowed_v1(p_previous text, p_next text)
returns boolean
language sql
immutable
as $$
  select case
    when p_next not in ('potential','confirmed','paid','lost','cancelled') then false
    when p_previous is null or p_previous = p_next then true
    when p_previous = 'potential' then p_next in ('confirmed','paid','lost','cancelled')
    when p_previous = 'confirmed' then p_next in ('paid','lost','cancelled')
    when p_previous = 'paid' then p_next = 'cancelled'
    when p_previous in ('lost','cancelled') then p_next in ('potential','confirmed')
    else false
  end;
$$;

create or replace function public.upsert_conversation_intelligence_v1(p_record jsonb)
returns setof public.conversation_intelligence
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_tenant text := lower(btrim(coalesce(p_record->>'tenant_id', '')));
  v_channel text := lower(btrim(coalesce(p_record->>'channel', '')));
  v_conversation text := btrim(coalesce(p_record->>'conversation_id', ''));
  v_bot_ops_key text;
  v_outcome_status text := nullif(lower(btrim(coalesce(p_record->>'outcome_status', ''))), '');
  v_outcome_type text := coalesce(nullif(lower(btrim(p_record->>'outcome_type')), ''), 'unknown');
  v_primary_bot text := lower(btrim(coalesce(p_record->>'primary_bot_id', '')));
  v_active_bot text := lower(btrim(coalesce(p_record->>'active_bot_id', p_record->>'primary_bot_id', '')));
  v_outcome_at timestamptz := nullif(p_record->>'outcome_updated_at', '')::timestamptz;
  v_first timestamptz := nullif(p_record->>'first_message_at', '')::timestamptz;
  v_last timestamptz := nullif(p_record->>'last_message_at', '')::timestamptz;
  v_now timestamptz := now();
  v_row public.conversation_intelligence%rowtype;
begin
  perform public.platform_require_service_role_v2();
  if v_tenant = '' or v_channel = '' or v_conversation = '' then
    raise exception 'conversation_identity_required';
  end if;
  if not exists (select 1 from public.tenants where id = v_tenant) then
    raise exception 'conversation_tenant_not_found';
  end if;
  if v_channel !~ '^[a-z0-9][a-z0-9_-]{0,39}$' then raise exception 'conversation_channel_invalid'; end if;
  if v_primary_bot !~ '^[a-z0-9][a-z0-9._-]{0,79}$' or v_active_bot !~ '^[a-z0-9][a-z0-9._-]{0,79}$' then raise exception 'conversation_bot_required'; end if;
  if v_outcome_type not in ('unknown','support','appointment','order','handoff','mixed') then raise exception 'conversation_outcome_type_invalid'; end if;
  if v_outcome_status is not null and v_outcome_status not in ('potential','confirmed','paid','lost','cancelled') then raise exception 'conversation_outcome_status_invalid'; end if;
  if v_outcome_status is not null and v_outcome_type not in ('appointment','order','mixed') then raise exception 'conversation_outcome_type_required'; end if;
  if coalesce(nullif(p_record->>'conversation_status', ''), 'open') not in ('open','resolved','archived') then raise exception 'conversation_status_invalid'; end if;

  v_bot_ops_key := encode(digest(v_tenant || chr(31) || v_channel || chr(31) || v_conversation, 'sha256'), 'hex');
  if nullif(lower(btrim(p_record->>'bot_ops_conversation_key')), '') is not null
    and lower(btrim(p_record->>'bot_ops_conversation_key')) <> v_bot_ops_key then
    raise exception 'conversation_bot_ops_key_mismatch';
  end if;

  insert into public.conversation_intelligence (
    contract_version, tenant_id, conversation_id, channel, channel_connection_id,
    primary_bot_id, active_bot_id, customer_ref, conversation_status,
    outcome_type, outcome_status, outcome_reason, outcome_updated_at,
    first_message_at, last_message_at, message_count, last_message_preview,
    last_message_direction, needs_human, bot_ops_conversation_key, created_at, updated_at
  ) values (
    1, v_tenant, v_conversation, v_channel, nullif(left(p_record->>'channel_connection_id', 200), ''),
    v_primary_bot, v_active_bot,
    nullif(left(p_record->>'customer_ref', 500), ''), coalesce(nullif(p_record->>'conversation_status', ''), 'open'),
    v_outcome_type, v_outcome_status, nullif(left(p_record->>'outcome_reason', 500), ''), v_outcome_at,
    v_first, v_last, greatest(0, coalesce((p_record->>'message_count')::bigint, 0)),
    nullif(left(p_record->>'last_message_preview', 240), ''), nullif(p_record->>'last_message_direction', ''),
    coalesce((p_record->>'needs_human')::boolean, false), v_bot_ops_key,
    coalesce(nullif(p_record->>'created_at', '')::timestamptz, v_first, v_now),
    coalesce(nullif(p_record->>'updated_at', '')::timestamptz, v_last, v_now)
  )
  on conflict (tenant_id, channel, conversation_id) do update set
    channel_connection_id = coalesce(excluded.channel_connection_id, public.conversation_intelligence.channel_connection_id),
    primary_bot_id = coalesce(public.conversation_intelligence.primary_bot_id, excluded.primary_bot_id),
    active_bot_id = coalesce(excluded.active_bot_id, public.conversation_intelligence.active_bot_id),
    customer_ref = coalesce(excluded.customer_ref, public.conversation_intelligence.customer_ref),
    conversation_status = excluded.conversation_status,
    outcome_type = case when excluded.outcome_updated_at is not null and
      (public.conversation_intelligence.outcome_updated_at is null or excluded.outcome_updated_at >= public.conversation_intelligence.outcome_updated_at)
      then excluded.outcome_type else public.conversation_intelligence.outcome_type end,
    outcome_status = case when excluded.outcome_updated_at is not null and
      (public.conversation_intelligence.outcome_updated_at is null or excluded.outcome_updated_at >= public.conversation_intelligence.outcome_updated_at)
      then excluded.outcome_status else public.conversation_intelligence.outcome_status end,
    outcome_reason = case when excluded.outcome_updated_at is not null and
      (public.conversation_intelligence.outcome_updated_at is null or excluded.outcome_updated_at >= public.conversation_intelligence.outcome_updated_at)
      then excluded.outcome_reason else public.conversation_intelligence.outcome_reason end,
    outcome_updated_at = greatest(public.conversation_intelligence.outcome_updated_at, excluded.outcome_updated_at),
    first_message_at = case
      when public.conversation_intelligence.first_message_at is null then excluded.first_message_at
      when excluded.first_message_at is null then public.conversation_intelligence.first_message_at
      else least(public.conversation_intelligence.first_message_at, excluded.first_message_at) end,
    last_message_at = greatest(public.conversation_intelligence.last_message_at, excluded.last_message_at),
    message_count = greatest(public.conversation_intelligence.message_count, excluded.message_count),
    last_message_preview = case when excluded.last_message_at is not null and
      (public.conversation_intelligence.last_message_at is null or excluded.last_message_at >= public.conversation_intelligence.last_message_at)
      then excluded.last_message_preview else public.conversation_intelligence.last_message_preview end,
    last_message_direction = case when excluded.last_message_at is not null and
      (public.conversation_intelligence.last_message_at is null or excluded.last_message_at >= public.conversation_intelligence.last_message_at)
      then excluded.last_message_direction else public.conversation_intelligence.last_message_direction end,
    needs_human = excluded.needs_human,
    bot_ops_conversation_key = excluded.bot_ops_conversation_key,
    created_at = least(public.conversation_intelligence.created_at, excluded.created_at),
    updated_at = greatest(public.conversation_intelligence.updated_at, excluded.updated_at)
  returning * into v_row;
  return next v_row;
end;
$$;

create or replace function public.upsert_conversation_business_object_v1(p_record jsonb)
returns setof public.conversation_business_objects
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_tenant text := lower(btrim(coalesce(p_record->>'tenant_id', '')));
  v_channel text := lower(btrim(coalesce(p_record->>'channel', '')));
  v_conversation text := btrim(coalesce(p_record->>'conversation_id', ''));
  v_type text := lower(btrim(coalesce(p_record->>'object_type', '')));
  v_object text := btrim(coalesce(p_record->>'object_id', ''));
  v_value_status text := lower(btrim(coalesce(p_record->>'value_status', '')));
  v_amount bigint := nullif(p_record->>'amount_minor', '')::bigint;
  v_currency text := nullif(upper(btrim(p_record->>'currency')), '');
  v_occurred timestamptz := coalesce(nullif(p_record->>'occurred_at', '')::timestamptz, now());
  v_previous public.conversation_business_objects%rowtype;
  v_row public.conversation_business_objects%rowtype;
begin
  perform public.platform_require_service_role_v2();
  if v_tenant = '' or v_channel = '' or v_conversation = '' or v_object = '' then raise exception 'conversation_business_identity_required'; end if;
  if v_type not in ('appointment','order') then raise exception 'conversation_business_type_invalid'; end if;
  if v_value_status not in ('potential','confirmed','paid','lost','cancelled') then raise exception 'conversation_value_status_invalid'; end if;
  if v_amount is not null and (v_amount < 0 or v_currency is null or v_currency !~ '^[A-Z]{3}$') then raise exception 'conversation_value_invalid'; end if;
  if v_amount is null and v_currency is not null then raise exception 'conversation_value_amount_required'; end if;
  if nullif(btrim(p_record->>'source_event_id'), '') is null then raise exception 'conversation_source_event_id_required'; end if;
  if not exists (
    select 1 from public.conversation_intelligence
    where tenant_id = v_tenant and channel = v_channel and conversation_id = v_conversation
  ) then raise exception 'conversation_not_found'; end if;

  select * into v_previous from public.conversation_business_objects
  where tenant_id = v_tenant and object_type = v_type and object_id = v_object for update;
  if found and (v_previous.channel <> v_channel or v_previous.conversation_id <> v_conversation) then
    raise exception 'conversation_business_object_reassignment_blocked';
  end if;
  if found and v_occurred < v_previous.occurred_at then
    return next v_previous;
    return;
  end if;
  if found and not public.conversation_value_transition_allowed_v1(v_previous.value_status, v_value_status) then
    raise exception 'conversation_value_transition_invalid';
  end if;

  if coalesce((p_record->>'is_primary')::boolean, false)
    and (v_previous.object_id is null or v_occurred >= v_previous.occurred_at) then
    update public.conversation_business_objects set is_primary = false, updated_at = now()
    where tenant_id = v_tenant and channel = v_channel and conversation_id = v_conversation and is_primary;
  end if;

  insert into public.conversation_business_objects (
    contract_version, tenant_id, conversation_id, channel, object_type, object_id,
    object_status, value_status, amount_minor, currency, is_primary,
    source_event_id, occurred_at, metadata, updated_at
  ) values (
    1, v_tenant, v_conversation, v_channel, v_type, left(v_object, 200),
    nullif(left(p_record->>'object_status', 80), ''), v_value_status, v_amount, v_currency,
    coalesce((p_record->>'is_primary')::boolean, false), left(p_record->>'source_event_id', 500),
    v_occurred, coalesce(p_record->'metadata', '{}'::jsonb),
    coalesce(nullif(p_record->>'updated_at', '')::timestamptz, v_occurred)
  )
  on conflict (tenant_id, object_type, object_id) do update set
    conversation_id = excluded.conversation_id,
    channel = excluded.channel,
    object_status = excluded.object_status,
    value_status = excluded.value_status,
    amount_minor = excluded.amount_minor,
    currency = excluded.currency,
    is_primary = excluded.is_primary,
    source_event_id = excluded.source_event_id,
    occurred_at = excluded.occurred_at,
    metadata = public.conversation_business_objects.metadata || excluded.metadata,
    updated_at = greatest(public.conversation_business_objects.updated_at, excluded.updated_at)
  where excluded.occurred_at >= public.conversation_business_objects.occurred_at
  returning * into v_row;

  if v_row.object_id is null then
    select * into v_row from public.conversation_business_objects
    where tenant_id = v_tenant and object_type = v_type and object_id = v_object;
  end if;

  update public.conversation_intelligence set
    outcome_type = case when outcome_type in ('unknown', v_type) then v_type else 'mixed' end,
    outcome_status = v_row.value_status,
    outcome_reason = v_row.object_type || ':' || coalesce(v_row.object_status, v_row.value_status),
    outcome_updated_at = v_row.occurred_at,
    updated_at = greatest(updated_at, v_row.updated_at)
  where tenant_id = v_row.tenant_id and channel = v_row.channel and conversation_id = v_row.conversation_id
    and (outcome_updated_at is null or v_row.occurred_at >= outcome_updated_at);

  return next v_row;
end;
$$;

create or replace function public.list_conversation_intelligence_summaries_v1(
  p_tenant_id text,
  p_limit integer default 50,
  p_before_activity timestamptz default null,
  p_before_id uuid default null
)
returns table (
  id uuid,
  contract_version smallint,
  tenant_id text,
  conversation_id text,
  channel text,
  channel_connection_id text,
  primary_bot_id text,
  active_bot_id text,
  customer_ref text,
  conversation_status text,
  outcome_type text,
  outcome_status text,
  outcome_reason text,
  first_message_at timestamptz,
  last_message_at timestamptz,
  message_count bigint,
  last_message_preview text,
  last_message_direction text,
  needs_human boolean,
  appointment_count bigint,
  order_count bigint,
  potential_value_minor numeric,
  confirmed_value_minor numeric,
  paid_value_minor numeric,
  lost_cancelled_count bigint,
  open_bot_ops_findings bigint,
  highest_bot_ops_severity text,
  last_bot_ops_review_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_tenant text := lower(btrim(coalesce(p_tenant_id, '')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
begin
  perform public.platform_require_service_role_v2();
  if v_tenant = '' then return; end if;
  return query
  select
    c.id, c.contract_version, c.tenant_id, c.conversation_id, c.channel,
    c.channel_connection_id, c.primary_bot_id, c.active_bot_id, c.customer_ref,
    c.conversation_status, c.outcome_type, c.outcome_status, c.outcome_reason,
    c.first_message_at, c.last_message_at, c.message_count,
    c.last_message_preview, c.last_message_direction, c.needs_human,
    coalesce(b.appointment_count, 0), coalesce(b.order_count, 0),
    coalesce(b.potential_value_minor, 0), coalesce(b.confirmed_value_minor, 0),
    coalesce(b.paid_value_minor, 0), coalesce(b.lost_cancelled_count, 0),
    coalesce(o.open_findings, 0), o.highest_severity, o.last_review_at,
    c.updated_at
  from public.conversation_intelligence c
  left join lateral (
    select
      count(*) filter (where object_type = 'appointment') as appointment_count,
      count(*) filter (where object_type = 'order') as order_count,
      coalesce(sum(amount_minor) filter (where value_status = 'potential'), 0) as potential_value_minor,
      coalesce(sum(amount_minor) filter (where value_status = 'confirmed'), 0) as confirmed_value_minor,
      coalesce(sum(amount_minor) filter (where value_status = 'paid'), 0) as paid_value_minor,
      count(*) filter (where value_status in ('lost','cancelled')) as lost_cancelled_count
    from public.conversation_business_objects b
    where b.tenant_id = c.tenant_id and b.channel = c.channel and b.conversation_id = c.conversation_id
  ) b on true
  left join lateral (
    select
      count(*) filter (where status in ('open','approval_pending')) as open_findings,
      case
        when bool_or(severity = 'critical' and status in ('open','approval_pending')) then 'critical'
        when bool_or(severity = 'attention' and status in ('open','approval_pending')) then 'attention'
        when bool_or(severity = 'opportunity' and status in ('open','approval_pending')) then 'opportunity'
        else null end as highest_severity,
      max(last_seen_at) as last_review_at
    from public.bot_ops_findings f
    where f.tenant_id = c.tenant_id and f.conversation_key = c.bot_ops_conversation_key
  ) o on true
  where c.tenant_id = v_tenant
    and (
      p_before_activity is null
      or coalesce(c.last_message_at, c.updated_at) < p_before_activity
      or (p_before_id is not null and coalesce(c.last_message_at, c.updated_at) = p_before_activity and c.id < p_before_id)
    )
  order by coalesce(c.last_message_at, c.updated_at) desc, c.id desc
  limit v_limit;
end;
$$;

revoke all on function public.conversation_value_transition_allowed_v1(text, text) from public, anon, authenticated;
revoke all on function public.upsert_conversation_intelligence_v1(jsonb) from public, anon, authenticated;
revoke all on function public.upsert_conversation_business_object_v1(jsonb) from public, anon, authenticated;
revoke all on function public.list_conversation_intelligence_summaries_v1(text, integer, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.conversation_value_transition_allowed_v1(text, text) to service_role;
grant execute on function public.upsert_conversation_intelligence_v1(jsonb) to service_role;
grant execute on function public.upsert_conversation_business_object_v1(jsonb) to service_role;
grant execute on function public.list_conversation_intelligence_summaries_v1(text, integer, timestamptz, uuid) to service_role;

commit;
