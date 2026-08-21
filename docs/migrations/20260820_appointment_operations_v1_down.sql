begin;

drop function if exists public.claim_due_appointment_reminders(integer, text);
drop table if exists public.appointment_events;
drop table if exists public.appointment_reminders;

do $$
begin
  if exists (
    select 1
    from public.appointments
    group by tenant_id, conversation_id
    having count(*) > 1
  ) then
    raise exception 'appointment_operations_v1 rollback blocked: multiple appointments now share a conversation';
  end if;
end;
$$;

drop index if exists public.appointments_tenant_conversation_start_idx;

alter table public.appointments
  drop constraint if exists appointments_tenant_appointment_id_key;

alter table public.appointments
  drop constraint if exists appointments_tenant_id_conversation_id_key;

alter table public.appointments
  add constraint appointments_tenant_id_conversation_id_key unique (tenant_id, conversation_id);

alter table public.appointments
  drop column if exists customer_conversation_id,
  drop column if exists appointment_id;

alter table public.appointments no force row level security;

commit;
