-- WhatsApp Embedded Signup v2: durable, one-shot registration attempts.
-- Apply in Staging before enabling the dedicated Supabase connection store.

begin;

alter table public.tenant_channel_connections
  add column if not exists registration_pin_required boolean not null default false,
  add column if not exists coexistence_confirmed boolean not null default false,
  add column if not exists onboarding_attempt_id text,
  add column if not exists onboarding_attempt_status text,
  add column if not exists onboarding_attempt_started_at timestamptz,
  add column if not exists onboarding_attempt_updated_at timestamptz,
  add column if not exists onboarding_attempt_registration_requested_at timestamptz,
  add column if not exists onboarding_attempt_registration_accepted_at timestamptz,
  add column if not exists onboarding_attempt_subscription_confirmed_at timestamptz,
  add column if not exists onboarding_attempt_phone_number_id text,
  add column if not exists onboarding_attempt_waba_id text,
  add column if not exists onboarding_attempt_ciphertext text,
  add column if not exists onboarding_attempt_last_error text,
  add column if not exists onboarding_attempt_last_error_at timestamptz,
  add column if not exists onboarding_attempt_reconcile_count integer not null default 0,
  add column if not exists onboarding_attempt_reconcile_after timestamptz,
  add column if not exists onboarding_attempt_reconcile_lease_until timestamptz,
  add column if not exists onboarding_attempt_reconcile_owner text,
  add column if not exists whatsapp_last_registration_phone_number_id text,
  add column if not exists whatsapp_last_registration_requested_at timestamptz;

-- Immutable global guard. Connection rows can be cancelled or replaced, but a
-- phone that already reached /register must remain protected across tenants and
-- process restarts for Meta's full 72-hour safety window.
create table if not exists public.whatsapp_registration_claims (
  id uuid primary key default gen_random_uuid(),
  attempt_id text not null unique,
  -- Keep the historical tenant key even if the tenant is later deleted. This
  -- ledger protects Meta's registration window; it must not become a permanent
  -- foreign-key lock on normal tenant lifecycle operations.
  tenant_id text not null,
  phone_number_id text not null,
  waba_id text not null,
  requested_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_registration_claims_phone_requested_idx
  on public.whatsapp_registration_claims (phone_number_id, requested_at desc);

-- Signed Meta deliveries are persisted before HTTP 200. The encrypted inbox
-- makes webhook retries idempotent across replicas and preserves every message
-- in a batched payload until one worker completes it.
create table if not exists public.meta_webhook_events (
  queue_id bigint generated always as identity unique,
  event_id text primary key,
  channel text not null check (channel in ('whatsapp')),
  destination_id text not null,
  sender_key text not null,
  tenant_id text,
  payload_ciphertext text check (
    payload_ciphertext is null or payload_ciphertext like 'enc:v1:%'
  ),
  status text not null default 'pending' check (
    status in ('pending', 'processing', 'completed', 'dead_letter')
  ),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz,
  lease_until timestamptz,
  lease_owner text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meta_webhook_events_due_idx
  on public.meta_webhook_events (next_attempt_at, queue_id)
  where status = 'pending';

create index if not exists meta_webhook_events_expired_lease_idx
  on public.meta_webhook_events (lease_until, queue_id)
  where status = 'processing';

create index if not exists meta_webhook_events_conversation_order_idx
  on public.meta_webhook_events (channel, destination_id, sender_key, queue_id);

alter table public.conversation_logs
  add column if not exists source_event_id text;

create unique index if not exists conversation_logs_source_event_owner_idx
  on public.conversation_logs (tenant_id, channel, source_event_id);

alter table public.tenant_channel_connections
  drop constraint if exists tenant_channel_connections_attempt_encrypted;

alter table public.tenant_channel_connections
  add constraint tenant_channel_connections_attempt_encrypted check (
    onboarding_attempt_ciphertext is null or onboarding_attempt_ciphertext like 'enc:v1:%'
  );

create unique index if not exists tenant_channel_connections_whatsapp_phone_owner_idx
  on public.tenant_channel_connections (phone_number_id)
  where channel = 'whatsapp'
    and phone_number_id is not null
    and status in ('connecting', 'connected', 'needs_attention');

create unique index if not exists tenant_channel_connections_whatsapp_waba_owner_idx
  on public.tenant_channel_connections (whatsapp_business_account_id)
  where channel = 'whatsapp'
    and whatsapp_business_account_id is not null
    and status in ('connecting', 'connected', 'needs_attention');

create unique index if not exists tenant_channel_connections_whatsapp_attempt_phone_idx
  on public.tenant_channel_connections (onboarding_attempt_phone_number_id)
  where channel = 'whatsapp'
    and onboarding_attempt_phone_number_id is not null
    and coalesce(onboarding_attempt_status, '') not in ('completed', 'cancelled');

create unique index if not exists tenant_channel_connections_whatsapp_attempt_waba_idx
  on public.tenant_channel_connections (onboarding_attempt_waba_id)
  where channel = 'whatsapp'
    and onboarding_attempt_waba_id is not null
    and coalesce(onboarding_attempt_status, '') not in ('completed', 'cancelled');

create unique index if not exists tenant_channel_connections_whatsapp_phone_claim_idx
  on public.tenant_channel_connections (
    coalesce(onboarding_attempt_phone_number_id, phone_number_id)
  )
  where channel = 'whatsapp'
    and coalesce(onboarding_attempt_phone_number_id, phone_number_id) is not null
    and (
      status in ('connecting', 'connected', 'needs_attention')
      or coalesce(onboarding_attempt_status, '') not in ('', 'completed', 'cancelled')
    );

create unique index if not exists tenant_channel_connections_whatsapp_waba_claim_idx
  on public.tenant_channel_connections (
    coalesce(onboarding_attempt_waba_id, whatsapp_business_account_id)
  )
  where channel = 'whatsapp'
    and coalesce(onboarding_attempt_waba_id, whatsapp_business_account_id) is not null
    and (
      status in ('connecting', 'connected', 'needs_attention')
      or coalesce(onboarding_attempt_status, '') not in ('', 'completed', 'cancelled')
    );

alter table public.tenant_channel_connection_audit
  drop constraint if exists tenant_channel_connection_audit_action;

alter table public.tenant_channel_connection_audit
  add constraint tenant_channel_connection_audit_action check (
    action in (
      'connection_started',
      'asset_selection_required',
      'connected',
      'connection_failed',
      'verified',
      'verification_failed',
      'activation_pending',
      'activated',
      'subscription_repaired',
      'reconnect_requested',
      'disconnected',
      'disconnect_failed',
      'temporary_ownership_released',
      'whatsapp_onboarding_started',
      'whatsapp_asset_validated',
      'whatsapp_registration_requested',
      'whatsapp_registration_accepted',
      'whatsapp_subscription_confirmed',
      'whatsapp_connection_pending',
      'whatsapp_onboarding_failed',
      'whatsapp_onboarding_cancelled'
    )
  );

-- Starting an Embedded Signup flow is itself a durable compare-and-set. The
-- advisory lock covers the no-row-yet case; FOR UPDATE covers an existing row.
-- A slow request can therefore never overwrite a newer attempt, a bound Meta
-- asset, or a registration claim created by another application replica.
create or replace function public.begin_whatsapp_attempt_v2(
  p_tenant_id text,
  p_attempt_id text,
  p_actor text,
  p_allow_protected_reconnect boolean default false
)
returns setof public.tenant_channel_connections
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_connection public.tenant_channel_connections%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role()::text, '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if coalesce(btrim(p_tenant_id), '') = '' or coalesce(btrim(p_attempt_id), '') = '' then
    raise exception 'WHATSAPP_BEGIN_INVALID' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('nextfor:wa-attempt:' || p_tenant_id, 0)
  );

  select * into v_connection
    from public.tenant_channel_connections
   where tenant_id = p_tenant_id and channel = 'whatsapp'
   for update;

  if found and v_connection.protected_legacy and not coalesce(p_allow_protected_reconnect, false) then
    raise exception 'LEGACY_CONNECTION_PROTECTED' using errcode = 'P0001';
  end if;
  if found and v_connection.status = 'connected' then
    raise exception 'WHATSAPP_CONNECTION_ACTIVE' using errcode = 'P0001';
  end if;
  if found
     and v_connection.onboarding_attempt_id is not null
     and coalesce(v_connection.onboarding_attempt_status, '') not in ('completed', 'cancelled') then
    raise exception 'WHATSAPP_ATTEMPT_ACTIVE' using errcode = 'P0001';
  end if;

  if found then
    update public.tenant_channel_connections
       set status = 'connecting',
           webhook_status = 'not_configured',
           last_error = null,
           last_error_at = null,
           pending_assets = '[]'::jsonb,
           registration_pin_required = false,
           coexistence_confirmed = false,
           onboarding_attempt_id = p_attempt_id,
           onboarding_attempt_status = 'awaiting_meta',
           onboarding_attempt_started_at = v_now,
           onboarding_attempt_updated_at = v_now,
           onboarding_attempt_registration_requested_at = null,
           onboarding_attempt_registration_accepted_at = null,
           onboarding_attempt_subscription_confirmed_at = null,
           onboarding_attempt_phone_number_id = null,
           onboarding_attempt_waba_id = null,
           onboarding_attempt_ciphertext = null,
           onboarding_attempt_last_error = null,
           onboarding_attempt_last_error_at = null,
           onboarding_attempt_reconcile_count = 0,
           onboarding_attempt_reconcile_after = null,
           onboarding_attempt_reconcile_lease_until = null,
           onboarding_attempt_reconcile_owner = null,
           updated_at = v_now
     where tenant_id = p_tenant_id and channel = 'whatsapp'
     returning * into v_connection;
  else
    insert into public.tenant_channel_connections (
      tenant_id,
      channel,
      status,
      webhook_status,
      pending_assets,
      registration_pin_required,
      coexistence_confirmed,
      onboarding_attempt_id,
      onboarding_attempt_status,
      onboarding_attempt_started_at,
      onboarding_attempt_updated_at,
      onboarding_attempt_reconcile_count,
      updated_at
    ) values (
      p_tenant_id,
      'whatsapp',
      'connecting',
      'not_configured',
      '[]'::jsonb,
      false,
      false,
      p_attempt_id,
      'awaiting_meta',
      v_now,
      v_now,
      0,
      v_now
    ) returning * into v_connection;
  end if;

  insert into public.tenant_channel_connection_audit (
    tenant_id, channel, action, actor, details
  ) values (
    p_tenant_id,
    'whatsapp',
    'whatsapp_onboarding_started',
    left(coalesce(nullif(p_actor, ''), 'system:whatsapp-onboarding'), 200),
    jsonb_build_object(
      'onboarding_attempt_id', p_attempt_id,
      'flow', 'new_cloud_api_number'
    )
  );

  return next v_connection;
end;
$$;

-- Provider unsubscribe is an external await. Finalize it only if the durable
-- connection is still the exact snapshot that initiated the call. Using the
-- same tenant advisory lock as begin_whatsapp_attempt_v2 guarantees that a new
-- attempt can never be erased by a late disconnect response.
create or replace function public.disconnect_whatsapp_connection_v2(
  p_tenant_id text,
  p_expected_status text,
  p_expected_updated_at timestamptz,
  p_expected_phone_number_id text,
  p_expected_waba_id text,
  p_expected_attempt_id text,
  p_expected_attempt_status text,
  p_disconnect_completed boolean,
  p_error text,
  p_actor text
)
returns setof public.tenant_channel_connections
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_connection public.tenant_channel_connections%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role()::text, '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('nextfor:wa-attempt:' || p_tenant_id, 0)
  );

  select * into v_connection
    from public.tenant_channel_connections
   where tenant_id = p_tenant_id and channel = 'whatsapp'
   for update;

  if not found
     or (
       v_connection.onboarding_attempt_id is not null
       and coalesce(v_connection.onboarding_attempt_status, '') not in ('completed', 'cancelled')
     )
     or v_connection.status is distinct from p_expected_status
     or v_connection.updated_at is distinct from p_expected_updated_at
     or v_connection.phone_number_id is distinct from p_expected_phone_number_id
     or v_connection.whatsapp_business_account_id is distinct from p_expected_waba_id
     or v_connection.onboarding_attempt_id is distinct from p_expected_attempt_id
     or v_connection.onboarding_attempt_status is distinct from p_expected_attempt_status then
    return;
  end if;

  if coalesce(p_disconnect_completed, false) then
    update public.tenant_channel_connections
       set status = 'disconnected',
           webhook_status = 'unsubscribed',
           last_error = null,
           last_error_at = null,
           disconnected_at = v_now,
           disconnected_by = left(coalesce(nullif(p_actor, ''), 'system'), 200),
           account_id = null,
           account_label = null,
           meta_business_id = null,
           whatsapp_business_account_id = null,
           phone_number_id = null,
           page_id = null,
           instagram_user_id = null,
           pending_assets = '[]'::jsonb,
           credentials_ciphertext = null,
           credential_source = null,
           registration_pin_required = false,
           coexistence_confirmed = false,
           onboarding_attempt_status = 'cancelled',
           onboarding_attempt_updated_at = v_now,
           onboarding_attempt_phone_number_id = null,
           onboarding_attempt_waba_id = null,
           onboarding_attempt_ciphertext = null,
           onboarding_attempt_last_error = null,
           onboarding_attempt_last_error_at = null,
           onboarding_attempt_reconcile_count = 0,
           onboarding_attempt_reconcile_after = null,
           onboarding_attempt_reconcile_lease_until = null,
           onboarding_attempt_reconcile_owner = null,
           updated_at = v_now
     where tenant_id = p_tenant_id and channel = 'whatsapp'
     returning * into v_connection;
  else
    update public.tenant_channel_connections
       set status = 'needs_attention',
           webhook_status = 'unsubscribe_unconfirmed',
           last_error = left(coalesce(nullif(p_error, ''), 'Meta unsubscribe failed'), 800),
           last_error_at = v_now,
           pending_assets = '[]'::jsonb,
           onboarding_attempt_updated_at = v_now,
           updated_at = v_now
     where tenant_id = p_tenant_id and channel = 'whatsapp'
     returning * into v_connection;
  end if;

  insert into public.tenant_channel_connection_audit (
    tenant_id, channel, action, actor, details
  ) values (
    p_tenant_id,
    'whatsapp',
    case when coalesce(p_disconnect_completed, false) then 'disconnected' else 'disconnect_failed' end,
    left(coalesce(nullif(p_actor, ''), 'system'), 200),
    jsonb_build_object(
      'provider_unsubscribe_confirmed', coalesce(p_disconnect_completed, false),
      'error', case when coalesce(p_disconnect_completed, false) then null else p_error end
    )
  );

  return next v_connection;
end;
$$;

create or replace function public.claim_whatsapp_registration_v2(
  p_tenant_id text,
  p_attempt_id text,
  p_phone_number_id text,
  p_attempt_ciphertext text,
  p_actor text
)
returns setof public.tenant_channel_connections
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_connection public.tenant_channel_connections%rowtype;
  v_waba_id text;
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(auth.role()::text, '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  select * into v_connection
    from public.tenant_channel_connections
   where tenant_id = p_tenant_id and channel = 'whatsapp'
   for update;

  if not found
     or v_connection.onboarding_attempt_id is distinct from p_attempt_id
     or coalesce(v_connection.onboarding_attempt_status, '') in (
       'completed', 'cancelled', 'registration_rejected', 'reconciliation_exhausted'
     )
     or v_connection.onboarding_attempt_registration_requested_at is not null then
    return;
  end if;

  v_waba_id := v_connection.onboarding_attempt_waba_id;
  if coalesce(p_phone_number_id, '') = ''
     or coalesce(v_waba_id, '') = ''
     or v_connection.onboarding_attempt_phone_number_id is distinct from p_phone_number_id
     or coalesce(p_attempt_ciphertext, '') not like 'enc:v1:%' then
    raise exception 'WHATSAPP_ATTEMPT_IDENTITY_MISMATCH' using errcode = '22023';
  end if;

  -- Every claimant takes locks in the same order, so two app instances cannot
  -- race either the same phone or its WABA ownership check.
  perform pg_advisory_xact_lock(hashtextextended('nextfor:wa-phone:' || p_phone_number_id, 0));
  perform pg_advisory_xact_lock(hashtextextended('nextfor:wa-waba:' || v_waba_id, 0));

  if exists (
    select 1 from public.whatsapp_registration_claims
     where phone_number_id = p_phone_number_id
       and requested_at > v_now - interval '72 hours'
  ) then
    raise exception 'WHATSAPP_REGISTRATION_COOLDOWN' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.tenant_channel_connections other
     where other.channel = 'whatsapp'
       and other.tenant_id <> p_tenant_id
       and (
         coalesce(other.onboarding_attempt_phone_number_id, other.phone_number_id) = p_phone_number_id
         or coalesce(other.onboarding_attempt_waba_id, other.whatsapp_business_account_id) = v_waba_id
       )
       and (
         other.status in ('connecting', 'connected', 'needs_attention')
         or coalesce(other.onboarding_attempt_status, '') not in ('', 'completed', 'cancelled')
       )
  ) then
    raise exception 'WHATSAPP_ASSET_ALREADY_ASSIGNED' using errcode = 'P0001';
  end if;

  insert into public.whatsapp_registration_claims (
    attempt_id, tenant_id, phone_number_id, waba_id, requested_at
  ) values (
    p_attempt_id, p_tenant_id, p_phone_number_id, v_waba_id, v_now
  );

  update public.tenant_channel_connections
     set status = 'connecting',
         onboarding_attempt_status = 'registering',
         onboarding_attempt_registration_requested_at = v_now,
         onboarding_attempt_ciphertext = p_attempt_ciphertext,
         onboarding_attempt_reconcile_count = 0,
         onboarding_attempt_reconcile_after = v_now + interval '30 seconds',
         onboarding_attempt_reconcile_lease_until = null,
         onboarding_attempt_reconcile_owner = null,
         whatsapp_last_registration_phone_number_id = p_phone_number_id,
         whatsapp_last_registration_requested_at = v_now,
         onboarding_attempt_updated_at = v_now,
         updated_at = v_now
   where tenant_id = p_tenant_id
     and channel = 'whatsapp'
     and onboarding_attempt_id = p_attempt_id;

  insert into public.tenant_channel_connection_audit (
    tenant_id, channel, action, actor, details
  ) values (
    p_tenant_id,
    'whatsapp',
    'whatsapp_registration_requested',
    coalesce(nullif(p_actor, ''), 'system:whatsapp-onboarding'),
    jsonb_build_object(
      'onboarding_attempt_id', p_attempt_id,
      'phone_number_suffix', right(p_phone_number_id, 8)
    )
  );

  return query
    select * from public.tenant_channel_connections
     where tenant_id = p_tenant_id and channel = 'whatsapp';
end;
$$;

-- A pending registration is reconciled by many possible application replicas,
-- but only one of them may call Graph for a given scheduled check. The durable
-- lease also applies a bounded 72-hour backoff so an abandoned attempt cannot
-- hammer Meta forever.
create or replace function public.claim_whatsapp_reconciliation_v2(
  p_tenant_id text,
  p_attempt_id text,
  p_owner text
)
returns setof public.tenant_channel_connections
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_connection public.tenant_channel_connections%rowtype;
  v_now timestamptz := clock_timestamp();
  v_next_count integer;
  v_delay interval;
begin
  if coalesce(auth.role()::text, '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  select * into v_connection
    from public.tenant_channel_connections
   where tenant_id = p_tenant_id and channel = 'whatsapp'
   for update;

  if not found
     or v_connection.onboarding_attempt_id is distinct from p_attempt_id
     or coalesce(v_connection.onboarding_attempt_status, '') in (
       'completed', 'cancelled', 'registration_rejected', 'reconciliation_exhausted'
     )
     or v_connection.onboarding_attempt_registration_requested_at is null
     or v_connection.onboarding_attempt_ciphertext is null then
    return;
  end if;

  if coalesce(
       v_connection.onboarding_attempt_started_at,
       v_connection.onboarding_attempt_registration_requested_at,
       v_now
     ) < v_now - interval '72 hours'
     or coalesce(v_connection.onboarding_attempt_reconcile_count, 0) >= 48 then
    update public.tenant_channel_connections
       set status = 'needs_attention',
           webhook_status = 'needs_attention',
           onboarding_attempt_status = 'reconciliation_exhausted',
           onboarding_attempt_last_error = 'WhatsApp reconciliation window exhausted',
           onboarding_attempt_last_error_at = v_now,
           onboarding_attempt_reconcile_lease_until = null,
           onboarding_attempt_reconcile_owner = null,
           onboarding_attempt_updated_at = v_now,
           updated_at = v_now
     where tenant_id = p_tenant_id
       and channel = 'whatsapp'
       and onboarding_attempt_id = p_attempt_id;
    return;
  end if;

  if coalesce(v_connection.onboarding_attempt_reconcile_after, '-infinity'::timestamptz) > v_now
     or coalesce(v_connection.onboarding_attempt_reconcile_lease_until, '-infinity'::timestamptz) > v_now then
    return;
  end if;

  v_next_count := coalesce(v_connection.onboarding_attempt_reconcile_count, 0) + 1;
  v_delay := case
    when v_next_count <= 4 then interval '30 seconds'
    when v_next_count <= 12 then interval '5 minutes'
    when v_next_count <= 24 then interval '30 minutes'
    when v_next_count <= 36 then interval '2 hours'
    else interval '6 hours'
  end;

  update public.tenant_channel_connections
     set onboarding_attempt_reconcile_count = v_next_count,
         onboarding_attempt_reconcile_after = v_now + v_delay,
         onboarding_attempt_reconcile_lease_until = v_now + interval '2 minutes',
         onboarding_attempt_reconcile_owner = left(
           coalesce(nullif(p_owner, ''), 'system:whatsapp-reconciler'),
           200
         ),
         onboarding_attempt_updated_at = v_now,
         updated_at = v_now
   where tenant_id = p_tenant_id
     and channel = 'whatsapp'
     and onboarding_attempt_id = p_attempt_id;

  return query
    select * from public.tenant_channel_connections
     where tenant_id = p_tenant_id and channel = 'whatsapp';
end;
$$;

create or replace function public.claim_meta_webhook_event_v1(
  p_owner text,
  p_lease_seconds integer default 180
)
returns setof public.meta_webhook_events
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_event_id text;
  v_now timestamptz := clock_timestamp();
  v_lease interval;
begin
  if coalesce(auth.role()::text, '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  v_lease := make_interval(secs => greatest(30, least(600, coalesce(p_lease_seconds, 180))));

  update public.meta_webhook_events
     set status = 'dead_letter',
         lease_owner = null,
         lease_until = null,
         next_attempt_at = null,
         last_error = coalesce(last_error, 'webhook_retry_window_exhausted'),
         updated_at = v_now
   where status in ('pending', 'processing')
     and (attempts >= 48 or received_at <= v_now - interval '72 hours')
     and coalesce(lease_until, '-infinity'::timestamptz) <= v_now;

  select candidate.event_id into v_event_id
    from public.meta_webhook_events candidate
   where candidate.attempts < 48
     and candidate.received_at > v_now - interval '72 hours'
     and (
       (candidate.status = 'pending' and coalesce(candidate.next_attempt_at, '-infinity'::timestamptz) <= v_now)
       or (candidate.status = 'processing' and coalesce(candidate.lease_until, '-infinity'::timestamptz) <= v_now)
     )
     and not exists (
       select 1
         from public.meta_webhook_events earlier
        where earlier.channel = candidate.channel
          and earlier.destination_id = candidate.destination_id
          and earlier.sender_key = candidate.sender_key
          and earlier.queue_id < candidate.queue_id
          and earlier.status in ('pending', 'processing')
     )
   order by candidate.queue_id asc
   for update skip locked
   limit 1;

  if not found then return; end if;

  update public.meta_webhook_events
     set status = 'processing',
         attempts = attempts + 1,
         lease_owner = left(coalesce(nullif(p_owner, ''), 'nextfor:webhook-worker'), 200),
         lease_until = v_now + v_lease,
         updated_at = v_now
   where event_id = v_event_id;

  return query
    select * from public.meta_webhook_events where event_id = v_event_id;
end;
$$;

create or replace function public.meta_webhook_inbox_ready_v1()
returns boolean
language plpgsql
security definer
stable
set search_path = public, auth, pg_temp
as $$
begin
  if coalesce(auth.role()::text, '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  return to_regclass('public.meta_webhook_events') is not null;
end;
$$;

alter table public.whatsapp_registration_claims enable row level security;
alter table public.whatsapp_registration_claims force row level security;
alter table public.meta_webhook_events enable row level security;
alter table public.meta_webhook_events force row level security;

revoke all on public.whatsapp_registration_claims from public, anon, authenticated;
grant select on public.whatsapp_registration_claims to service_role;
revoke all on public.meta_webhook_events from public, anon, authenticated;
grant select, insert, update on public.meta_webhook_events to service_role;
revoke all on function public.begin_whatsapp_attempt_v2(text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.begin_whatsapp_attempt_v2(text, text, text, boolean)
  to service_role;
revoke all on function public.disconnect_whatsapp_connection_v2(
  text, text, timestamptz, text, text, text, text, boolean, text, text
)
  from public, anon, authenticated;
grant execute on function public.disconnect_whatsapp_connection_v2(
  text, text, timestamptz, text, text, text, text, boolean, text, text
)
  to service_role;
revoke all on function public.claim_whatsapp_registration_v2(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_whatsapp_registration_v2(text, text, text, text, text)
  to service_role;
revoke all on function public.claim_whatsapp_reconciliation_v2(text, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_whatsapp_reconciliation_v2(text, text, text)
  to service_role;
revoke all on function public.claim_meta_webhook_event_v1(text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_meta_webhook_event_v1(text, integer)
  to service_role;
revoke all on function public.meta_webhook_inbox_ready_v1()
  from public, anon, authenticated;
grant execute on function public.meta_webhook_inbox_ready_v1()
  to service_role;

commit;
