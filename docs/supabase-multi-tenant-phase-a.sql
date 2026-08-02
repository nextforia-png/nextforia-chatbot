-- Phase A: tag every conversation with its tenant and channel.
-- Apply first to the existing RAV Toys project, then enable
-- SUPABASE_TENANT_COLUMNS_ENABLED=1 in that deployment.

begin;

alter table public.conversation_logs
  add column if not exists tenant_id text,
  add column if not exists phone_number_id text,
  add column if not exists channel text;

-- Preserve an explicit tenant embedded in append-only internal records. Older
-- encrypted/normal turns did not carry a database tenant column and cannot be
-- assigned safely, so quarantine them instead of exposing them to RAV or to a
-- newly registered customer.
update public.conversation_logs
set tenant_id = coalesce(
  nullif(substring(bot_reply from '"tenant_id"[[:space:]]*:[[:space:]]*"([a-z0-9_-]+)"'), ''),
  'legacy-unassigned'
)
where tenant_id is null;

-- The original RAV dashboard id is an alias; production webhooks and channel
-- credentials use the registered tenant id.
update public.conversation_logs
set tenant_id = 'rav-toys-adac1e'
where tenant_id = 'rav-toys';

update public.conversation_logs
set channel = coalesce(
  nullif(substring(bot_reply from '"channel"[[:space:]]*:[[:space:]]*"(whatsapp|instagram|messenger)"'), ''),
  case
    when user_id like 'ig:%' then 'instagram'
    when user_id like 'ms:%' then 'messenger'
    else 'internal'
  end
)
where channel is null;

alter table public.conversation_logs
  alter column tenant_id set not null;

create index if not exists conversation_logs_tenant_ts_idx
  on public.conversation_logs (tenant_id, ts desc);

create index if not exists conversation_logs_tenant_user_ts_idx
  on public.conversation_logs (tenant_id, user_id, ts desc);

commit;
