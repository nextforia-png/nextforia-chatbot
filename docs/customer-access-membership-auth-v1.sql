-- Customer Panel membership-only authentication and password recovery.
-- Apply in Staging first. This migration does not move or delete tenant data.
begin;

alter table public.tenant_users
  add column if not exists auth_provider text not null default 'local',
  add column if not exists auth_user_id uuid unique,
  add column if not exists session_version bigint not null default 1;

alter table public.tenant_users
  drop constraint if exists tenant_users_auth_provider_values,
  drop constraint if exists tenant_users_auth_identity_required,
  drop constraint if exists tenant_users_supabase_password_absent,
  drop constraint if exists tenant_users_password_state,
  drop constraint if exists tenant_users_session_version_positive;

alter table public.tenant_users
  add constraint tenant_users_auth_provider_values
    check (auth_provider in ('local', 'supabase')),
  add constraint tenant_users_auth_identity_required
    check (auth_provider <> 'supabase' or auth_user_id is not null),
  add constraint tenant_users_supabase_password_absent
    check (auth_provider <> 'supabase' or (password_hash is null and password_salt is null)),
  add constraint tenant_users_password_state check (
    (status = 'pending' and active = false and password_hash is null and password_salt is null)
    or (
      status = 'active' and active = true and (
        (auth_provider = 'local' and password_hash is not null and password_salt is not null)
        or (auth_provider = 'supabase' and password_hash is null and password_salt is null)
      )
    )
    or (status = 'disabled' and active = false)
  ),
  add constraint tenant_users_session_version_positive check (session_version > 0);

create table if not exists public.tenant_password_recovery_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references public.tenant_users(user_id) on update restrict on delete restrict,
  tenant_id text not null references public.tenants(id) on update restrict on delete restrict,
  email_normalized text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists tenant_password_recovery_expiry_idx
  on public.tenant_password_recovery_tokens (expires_at)
  where used_at is null;

alter table public.tenant_password_recovery_tokens enable row level security;
revoke all on public.tenant_password_recovery_tokens from anon, authenticated;
grant select, insert, update, delete on public.tenant_password_recovery_tokens to service_role;

commit;
