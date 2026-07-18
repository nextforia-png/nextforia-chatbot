-- Phase A: tag every conversation with its tenant and channel.
-- Apply first to the existing RAV Toys project, then enable
-- SUPABASE_TENANT_COLUMNS_ENABLED=1 in that deployment.

begin;

alter table public.conversation_logs
  add column if not exists tenant_id text,
  add column if not exists phone_number_id text,
  add column if not exists channel text;

update public.conversation_logs
set tenant_id = 'rav-toys'
where tenant_id is null;

update public.conversation_logs
set channel = case
  when user_id like 'ig:%' then 'instagram'
  when user_id like 'ms:%' then 'messenger'
  else 'whatsapp'
end
where channel is null;

alter table public.conversation_logs
  alter column tenant_id set not null;

create index if not exists conversation_logs_tenant_ts_idx
  on public.conversation_logs (tenant_id, ts desc);

create index if not exists conversation_logs_tenant_user_ts_idx
  on public.conversation_logs (tenant_id, user_id, ts desc);

commit;
