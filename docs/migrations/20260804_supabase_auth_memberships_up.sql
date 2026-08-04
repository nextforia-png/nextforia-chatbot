-- Allow official tenant memberships to use Supabase Auth without duplicating
-- password material, and allow setup-pending tenants to omit plan/bot choices.

begin;

alter table public.tenants
  alter column plan_id drop not null,
  alter column assigned_bot_id drop not null;

alter table public.tenant_users
  add column if not exists auth_provider text not null default 'local';

alter table public.tenant_users
  drop constraint if exists tenant_users_auth_provider_values,
  drop constraint if exists tenant_users_supabase_password_absent,
  drop constraint if exists tenant_users_password_state;

alter table public.tenant_users
  add constraint tenant_users_auth_provider_values
    check (auth_provider in ('local', 'supabase')),
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
  );

commit;
