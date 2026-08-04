-- Run only after removing every membership whose auth_provider is 'supabase'
-- and resolving every tenant whose plan_id or assigned_bot_id is null.

begin;

do $$
begin
  if exists (select 1 from public.tenant_users where auth_provider = 'supabase') then
    raise exception 'SUPABASE_MEMBERSHIPS_STILL_EXIST';
  end if;
  if exists (select 1 from public.tenants where plan_id is null or assigned_bot_id is null) then
    raise exception 'SETUP_PENDING_TENANTS_STILL_EXIST';
  end if;
end;
$$;

alter table public.tenant_users
  drop constraint if exists tenant_users_password_state,
  drop constraint if exists tenant_users_supabase_password_absent,
  drop constraint if exists tenant_users_auth_provider_values;

alter table public.tenant_users
  add constraint tenant_users_password_state check (
    (status = 'pending' and active = false and password_hash is null and password_salt is null)
    or (status = 'active' and active = true and password_hash is not null and password_salt is not null)
    or (status = 'disabled' and active = false)
  );

alter table public.tenant_users drop column auth_provider;

alter table public.tenants
  alter column plan_id set not null,
  alter column assigned_bot_id set not null;

commit;
