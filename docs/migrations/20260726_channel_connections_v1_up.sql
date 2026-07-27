-- NextforIA Channel Connection Flow v1.
-- SOLO STAGING. No aplicar a Producción sin aprobación explícita de Santiago.
-- Depende de 20260721_customer_access_v2_up.sql.

begin;

create table if not exists public.tenant_channel_connections (
  tenant_id text not null references public.tenants(id) on delete cascade,
  channel text not null,
  status text not null default 'not_connected',
  account_id text,
  account_label text,
  meta_business_id text,
  whatsapp_business_account_id text,
  phone_number_id text,
  page_id text,
  instagram_user_id text,
  webhook_status text not null default 'not_configured',
  last_verified_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  connected_at timestamptz,
  disconnected_at timestamptz,
  connected_by text,
  disconnected_by text,
  pending_assets jsonb not null default '[]'::jsonb,
  credentials_ciphertext text,
  credential_source text,
  protected_legacy boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, channel),
  constraint tenant_channel_connections_channel check (
    channel in ('whatsapp', 'instagram', 'messenger')
  ),
  constraint tenant_channel_connections_status check (
    status in ('not_connected', 'connecting', 'connected', 'needs_attention', 'disconnected')
  ),
  constraint tenant_channel_connections_encrypted_credentials check (
    credentials_ciphertext is null or credentials_ciphertext like 'enc:v1:%'
  ),
  constraint tenant_channel_connections_pending_assets_array check (
    jsonb_typeof(pending_assets) = 'array'
  )
);

create index if not exists tenant_channel_connections_status_idx
  on public.tenant_channel_connections (status, updated_at desc);

create table if not exists public.tenant_channel_connection_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete cascade,
  channel text not null,
  action text not null,
  actor text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint tenant_channel_connection_audit_channel check (
    channel in ('whatsapp', 'instagram', 'messenger')
  ),
  constraint tenant_channel_connection_audit_action check (
    action in (
      'connection_started',
      'asset_selection_required',
      'connected',
      'connection_failed',
      'verified',
      'verification_failed',
      'reconnect_requested',
      'disconnected',
      'disconnect_failed'
    )
  )
);

create index if not exists tenant_channel_connection_audit_tenant_idx
  on public.tenant_channel_connection_audit (tenant_id, channel, created_at desc);

alter table public.tenant_channel_connections enable row level security;
alter table public.tenant_channel_connections force row level security;
alter table public.tenant_channel_connection_audit enable row level security;
alter table public.tenant_channel_connection_audit force row level security;

revoke all on public.tenant_channel_connections,
  public.tenant_channel_connection_audit
  from public, anon, authenticated;

grant select, insert, update on public.tenant_channel_connections,
  public.tenant_channel_connection_audit
  to service_role;

commit;
