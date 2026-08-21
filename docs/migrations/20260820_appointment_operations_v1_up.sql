begin;

create extension if not exists pgcrypto;

alter table public.appointments
  add column if not exists appointment_id text,
  add column if not exists customer_conversation_id text;

update public.appointments
set appointment_id = conversation_id
where appointment_id is null or btrim(appointment_id) = '';

alter table public.appointments
  alter column appointment_id set not null;

alter table public.appointments
  drop constraint if exists appointments_tenant_id_conversation_id_key;

alter table public.appointments
  drop constraint if exists appointments_tenant_appointment_id_key;

alter table public.appointments
  add constraint appointments_tenant_appointment_id_key unique (tenant_id, appointment_id);

create index if not exists appointments_tenant_conversation_start_idx
  on public.appointments (tenant_id, customer_conversation_id, starts_at desc)
  where customer_conversation_id is not null;

create table if not exists public.appointment_reminders (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  appointment_id text not null,
  reminder_key text not null,
  conversation_id text,
  "channel" text not null check ("channel" in ('whatsapp','email','sms')),
  offset_minutes integer not null check (offset_minutes > 0 and offset_minutes <= 43200),
  scheduled_for timestamptz not null,
  status text not null default 'scheduled' check (status in (
    'scheduled','paused','sending','sent','delivered','read','confirmed',
    'retrying','no_response','failed','cancelled'
  )),
  attempts integer not null default 0 check (attempts >= 0 and attempts <= 100),
  provider_message_id text,
  claimed_at timestamptz,
  claimed_by text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  confirmed_at timestamptz,
  last_action text,
  last_action_by text,
  last_action_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointment_reminders_tenant_appointment_fk
    foreign key (tenant_id, appointment_id)
    references public.appointments (tenant_id, appointment_id)
    on delete cascade,
  constraint appointment_reminders_tenant_key_unique unique (tenant_id, reminder_key),
  check (jsonb_typeof(metadata) = 'object')
);

create index if not exists appointment_reminders_due_idx
  on public.appointment_reminders (scheduled_for, tenant_id)
  where status in ('scheduled','retrying','failed');

create index if not exists appointment_reminders_tenant_appointment_idx
  on public.appointment_reminders (tenant_id, appointment_id, scheduled_for desc);

create index if not exists appointment_reminders_tenant_status_idx
  on public.appointment_reminders (tenant_id, status, updated_at desc);

create table if not exists public.appointment_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  appointment_id text not null,
  event_type text not null,
  idempotency_key text not null,
  actor_type text not null default 'system' check (actor_type in ('system','bot','customer','panel_user','super_admin','worker','provider')),
  actor_id text,
  metadata jsonb not null default '{}'::jsonb,
  payload_ciphertext text,
  created_at timestamptz not null default now(),
  constraint appointment_events_tenant_appointment_fk
    foreign key (tenant_id, appointment_id)
    references public.appointments (tenant_id, appointment_id)
    on delete cascade,
  constraint appointment_events_tenant_idempotency_unique unique (tenant_id, idempotency_key),
  check (jsonb_typeof(metadata) = 'object')
);

create index if not exists appointment_events_tenant_appointment_idx
  on public.appointment_events (tenant_id, appointment_id, created_at desc);

create index if not exists appointment_events_tenant_type_idx
  on public.appointment_events (tenant_id, event_type, created_at desc);

alter table public.appointments enable row level security;
alter table public.appointments force row level security;
alter table public.appointment_reminders enable row level security;
alter table public.appointment_reminders force row level security;
alter table public.appointment_events enable row level security;
alter table public.appointment_events force row level security;

drop policy if exists appointments_service_role on public.appointments;
create policy appointments_service_role on public.appointments
  for all to service_role using (true) with check (true);

drop policy if exists appointment_reminders_service_role on public.appointment_reminders;
create policy appointment_reminders_service_role on public.appointment_reminders
  for all to service_role using (true) with check (true);

drop policy if exists appointment_events_service_role_select on public.appointment_events;
create policy appointment_events_service_role_select on public.appointment_events
  for select to service_role using (true);

drop policy if exists appointment_events_service_role_insert on public.appointment_events;
create policy appointment_events_service_role_insert on public.appointment_events
  for insert to service_role with check (true);

revoke all on table public.appointments from public, anon, authenticated;
revoke all on table public.appointment_reminders from public, anon, authenticated;
revoke all on table public.appointment_events from public, anon, authenticated;

grant select, insert, update, delete on table public.appointments to service_role;
grant select, insert, update, delete on table public.appointment_reminders to service_role;
grant select, insert on table public.appointment_events to service_role;

create or replace function public.claim_due_appointment_reminders(
  p_limit integer default 20,
  p_worker_id text default 'appointment-reminder-worker'
)
returns setof public.appointment_reminders
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role()::text, '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  return query
  with due as (
    select reminder.id
    from public.appointment_reminders reminder
    where reminder.status in ('scheduled','retrying','failed')
      and reminder.scheduled_for <= now()
      and reminder.attempts < 5
    order by reminder.scheduled_for asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  )
  update public.appointment_reminders reminder
  set status = 'sending',
      attempts = reminder.attempts + 1,
      claimed_at = now(),
      claimed_by = left(coalesce(nullif(btrim(p_worker_id), ''), 'appointment-reminder-worker'), 200),
      updated_at = now()
  from due
  where reminder.id = due.id
  returning reminder.*;
end;
$$;

revoke all on function public.claim_due_appointment_reminders(integer, text) from public, anon, authenticated;
grant execute on function public.claim_due_appointment_reminders(integer, text) to service_role;

commit;
