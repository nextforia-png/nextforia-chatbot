-- Customer access v2 for the isolated NextforIA Staging Supabase project.
-- Do not apply to production before explicit release approval.

begin;

create extension if not exists pgcrypto;

create table if not exists public.platform_plans (
  id text primary key,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_plans_id_format check (id ~ '^[a-z0-9][a-z0-9_-]{1,63}$')
);

create table if not exists public.platform_bots (
  id text primary key,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_bots_id_format check (id ~ '^[a-z0-9][a-z0-9_-]{1,63}$')
);

insert into public.platform_plans (id, name) values
  ('starter', 'Starter'),
  ('growth', 'Growth'),
  ('scale', 'Scale')
on conflict (id) do nothing;

insert into public.platform_bots (id, name) values
  ('atencion-cliente', 'Atención al cliente'),
  ('agendamiento', 'Agendamiento'),
  ('commerce', 'Commerce')
on conflict (id) do nothing;

create table if not exists public.tenants (
  id text primary key,
  company_name text not null,
  plan_id text not null references public.platform_plans(id),
  assigned_bot_id text not null references public.platform_bots(id),
  status text not null default 'setup',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenants_id_format check (id ~ '^[a-z0-9][a-z0-9-]{2,63}$'),
  constraint tenants_company_name_length check (char_length(company_name) between 2 and 120),
  constraint tenants_status_values check (status in ('setup', 'pilot', 'live', 'paused'))
);

create unique index if not exists tenants_company_name_normalized_uidx
  on public.tenants (lower(btrim(company_name)));
create index if not exists tenants_plan_status_idx
  on public.tenants (plan_id, status);
create index if not exists tenants_bot_status_idx
  on public.tenants (assigned_bot_id, status);

create table if not exists public.tenant_users (
  user_id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete restrict,
  email_normalized text not null,
  password_hash text,
  password_salt text,
  role text not null default 'admin',
  status text not null default 'pending',
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_users_email_normalized check (
    email_normalized = lower(btrim(email_normalized))
    and char_length(email_normalized) between 3 and 254
    and email_normalized ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint tenant_users_role_values check (role in ('admin', 'agent', 'viewer')),
  constraint tenant_users_status_values check (status in ('pending', 'active', 'disabled')),
  constraint tenant_users_password_state check (
    (status = 'pending' and active = false and password_hash is null and password_salt is null)
    or (status = 'active' and active = true and password_hash is not null and password_salt is not null)
    or (status = 'disabled' and active = false)
  ),
  unique (user_id, tenant_id),
  unique (email_normalized)
);

create index if not exists tenant_users_tenant_role_status_idx
  on public.tenant_users (tenant_id, role, status);

create table if not exists public.tenant_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete restrict,
  tenant_user_id uuid not null,
  email_normalized text not null,
  role text not null default 'admin',
  token_hash text not null,
  delivery_status text not null default 'pending',
  provider_message_id text,
  delivery_error text,
  expires_at timestamptz not null,
  delivered_at timestamptz,
  used_at timestamptz,
  revoked_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_invitations_user_tenant_fk
    foreign key (tenant_user_id, tenant_id)
    references public.tenant_users(user_id, tenant_id) on delete restrict,
  constraint tenant_invitations_email_normalized check (email_normalized = lower(btrim(email_normalized))),
  constraint tenant_invitations_role_admin check (role = 'admin'),
  constraint tenant_invitations_token_hash check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint tenant_invitations_delivery_status check (delivery_status in ('pending', 'sent', 'failed')),
  constraint tenant_invitations_terminal_state check (not (used_at is not null and revoked_at is not null)),
  unique (token_hash)
);

create index if not exists tenant_invitations_tenant_created_idx
  on public.tenant_invitations (tenant_id, created_at desc);
create index if not exists tenant_invitations_email_created_idx
  on public.tenant_invitations (email_normalized, created_at desc);
create index if not exists tenant_invitations_status_expiry_idx
  on public.tenant_invitations (delivery_status, expires_at)
  where used_at is null and revoked_at is null;
create unique index if not exists tenant_invitations_one_open_email_uidx
  on public.tenant_invitations (email_normalized)
  where used_at is null and revoked_at is null;

create table if not exists public.tenant_access_audit (
  id bigint generated always as identity primary key,
  tenant_id text references public.tenants(id) on delete restrict,
  invitation_id uuid references public.tenant_invitations(id) on delete restrict,
  actor text not null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint tenant_access_audit_action check (action in (
    'tenant_invitation_created',
    'invitation_delivered',
    'invitation_delivery_failed',
    'invitation_consumed',
    'invitation_revoked',
    'tenant_user_login'
  ))
);

create index if not exists tenant_access_audit_tenant_created_idx
  on public.tenant_access_audit (tenant_id, created_at desc);
create index if not exists tenant_access_audit_invitation_created_idx
  on public.tenant_access_audit (invitation_id, created_at desc);

alter table public.platform_plans enable row level security;
alter table public.platform_bots enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_users enable row level security;
alter table public.tenant_invitations enable row level security;
alter table public.tenant_access_audit enable row level security;

alter table public.platform_plans force row level security;
alter table public.platform_bots force row level security;
alter table public.tenants force row level security;
alter table public.tenant_users force row level security;
alter table public.tenant_invitations force row level security;
alter table public.tenant_access_audit force row level security;

revoke all on public.platform_plans, public.platform_bots, public.tenants,
  public.tenant_users, public.tenant_invitations, public.tenant_access_audit
  from public, anon, authenticated;
grant select, insert, update on public.platform_plans, public.platform_bots, public.tenants,
  public.tenant_users, public.tenant_invitations, public.tenant_access_audit
  to service_role;
grant usage, select on sequence public.tenant_access_audit_id_seq to service_role;

create or replace function public.platform_require_service_role_v2()
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if coalesce(auth.role()::text, '') <> 'service_role' then
    raise exception 'PLATFORM_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.platform_customer_access_catalogs_v2()
returns table (plans jsonb, bots jsonb)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  perform public.platform_require_service_role_v2();
  return query select
    coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.name) from public.platform_plans p where p.active), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name) order by b.name) from public.platform_bots b where b.active), '[]'::jsonb);
end;
$$;

create or replace function public.platform_create_customer_invitation_v2(
  p_company_name text,
  p_admin_email text,
  p_plan_id text,
  p_assigned_bot_id text,
  p_token_hash text,
  p_expires_at timestamptz,
  p_created_by text
)
returns table (
  id uuid,
  tenant_id text,
  tenant_user_id uuid,
  email_normalized text,
  company_name text,
  plan_id text,
  assigned_bot_id text,
  role text,
  delivery_status text,
  delivery_error text,
  provider_message_id text,
  created_at timestamptz,
  expires_at timestamptz,
  delivered_at timestamptz,
  used_at timestamptz,
  revoked_at timestamptz,
  tenant_status text,
  membership_status text
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_email text := lower(btrim(p_admin_email));
  v_slug text;
  v_tenant public.tenants%rowtype;
  v_user public.tenant_users%rowtype;
  v_invitation public.tenant_invitations%rowtype;
begin
  perform public.platform_require_service_role_v2();
  if not exists (select 1 from public.platform_plans where platform_plans.id = p_plan_id and active) then
    raise exception 'INVALID_PLAN';
  end if;
  if not exists (select 1 from public.platform_bots where platform_bots.id = p_assigned_bot_id and active) then
    raise exception 'INVALID_ASSIGNED_BOT';
  end if;
  if exists (select 1 from public.tenant_users where tenant_users.email_normalized = v_email) then
    raise exception 'CUSTOMER_ALREADY_EXISTS';
  end if;
  if exists (select 1 from public.tenants where lower(btrim(tenants.company_name)) = lower(btrim(p_company_name))) then
    raise exception 'CUSTOMER_ALREADY_EXISTS';
  end if;

  v_slug := lower(translate(p_company_name, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'));
  v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
  v_slug := btrim(v_slug, '-');
  if v_slug = '' then v_slug := 'cliente'; end if;
  v_slug := left(v_slug, 45) || '-' || left(replace(gen_random_uuid()::text, '-', ''), 6);

  insert into public.tenants (id, company_name, plan_id, assigned_bot_id, status)
  values (v_slug, btrim(p_company_name), p_plan_id, p_assigned_bot_id, 'setup')
  returning * into v_tenant;

  insert into public.tenant_users (tenant_id, email_normalized, role, status, active)
  values (v_tenant.id, v_email, 'admin', 'pending', false)
  returning * into v_user;

  insert into public.tenant_invitations (
    tenant_id, tenant_user_id, email_normalized, role, token_hash,
    delivery_status, expires_at, created_by
  ) values (
    v_tenant.id, v_user.user_id, v_email, 'admin', p_token_hash,
    'pending', p_expires_at, left(p_created_by, 160)
  ) returning * into v_invitation;

  insert into public.tenant_access_audit (tenant_id, invitation_id, actor, action, metadata)
  values (
    v_tenant.id,
    v_invitation.id,
    left(p_created_by, 160),
    'tenant_invitation_created',
    jsonb_build_object('plan_id', p_plan_id, 'assigned_bot_id', p_assigned_bot_id, 'admin_email', v_email)
  );

  return query select
    v_invitation.id, v_invitation.tenant_id, v_invitation.tenant_user_id,
    v_invitation.email_normalized, v_tenant.company_name, v_tenant.plan_id,
    v_tenant.assigned_bot_id, v_invitation.role, v_invitation.delivery_status,
    v_invitation.delivery_error, v_invitation.provider_message_id,
    v_invitation.created_at, v_invitation.expires_at, v_invitation.delivered_at,
    v_invitation.used_at, v_invitation.revoked_at, v_tenant.status, v_user.status;
exception
  when unique_violation then
    raise exception 'CUSTOMER_ALREADY_EXISTS';
end;
$$;

create or replace function public.platform_update_invitation_delivery_v2(
  p_invitation_id uuid,
  p_delivery_status text,
  p_provider_message_id text default null,
  p_delivery_error text default null
)
returns setof public.tenant_invitations
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_row public.tenant_invitations%rowtype;
begin
  perform public.platform_require_service_role_v2();
  if p_delivery_status not in ('sent', 'failed') then raise exception 'INVALID_DELIVERY_STATUS'; end if;
  update public.tenant_invitations
  set delivery_status = p_delivery_status,
      provider_message_id = case when p_delivery_status = 'sent' then left(p_provider_message_id, 200) else null end,
      delivery_error = case when p_delivery_status = 'failed' then left(p_delivery_error, 160) else null end,
      delivered_at = case when p_delivery_status = 'sent' then now() else null end,
      updated_at = now()
  where tenant_invitations.id = p_invitation_id
  returning * into v_row;
  if v_row.id is null then raise exception 'INVALID_INVITATION'; end if;
  insert into public.tenant_access_audit (tenant_id, invitation_id, actor, action)
  values (v_row.tenant_id, v_row.id, 'email_provider', case when p_delivery_status = 'sent' then 'invitation_delivered' else 'invitation_delivery_failed' end);
  return next v_row;
end;
$$;

create or replace function public.platform_get_customer_invitation_v2(p_tenant_id text, p_token_hash text)
returns table (
  id uuid, tenant_id text, tenant_user_id uuid, email_normalized text,
  company_name text, plan_id text, assigned_bot_id text, role text,
  delivery_status text, delivery_error text, provider_message_id text,
  created_at timestamptz, expires_at timestamptz, delivered_at timestamptz,
  used_at timestamptz, revoked_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  perform public.platform_require_service_role_v2();
  return query
  select i.id, i.tenant_id, i.tenant_user_id, i.email_normalized,
    t.company_name, t.plan_id, t.assigned_bot_id, i.role,
    i.delivery_status, i.delivery_error, i.provider_message_id,
    i.created_at, i.expires_at, i.delivered_at, i.used_at, i.revoked_at
  from public.tenant_invitations i
  join public.tenants t on t.id = i.tenant_id
  where i.tenant_id = p_tenant_id and i.token_hash = p_token_hash;
end;
$$;

create or replace function public.platform_consume_customer_invitation_v2(
  p_tenant_id text,
  p_token_hash text,
  p_password_hash text,
  p_password_salt text
)
returns table (user_id uuid, tenant_id text, email_normalized text, role text, company_name text)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_invitation public.tenant_invitations%rowtype;
  v_company_name text;
begin
  perform public.platform_require_service_role_v2();
  select * into v_invitation
  from public.tenant_invitations i
  where i.tenant_id = p_tenant_id and i.token_hash = p_token_hash
  for update;
  if v_invitation.id is null then raise exception 'INVALID_INVITATION'; end if;
  if v_invitation.used_at is not null then raise exception 'INVITATION_ALREADY_USED'; end if;
  if v_invitation.revoked_at is not null then raise exception 'INVITATION_REVOKED'; end if;
  if v_invitation.expires_at <= now() then raise exception 'INVITATION_EXPIRED'; end if;

  update public.tenant_users u
  set password_hash = p_password_hash,
      password_salt = p_password_salt,
      status = 'active',
      active = true,
      updated_at = now()
  where u.user_id = v_invitation.tenant_user_id and u.tenant_id = v_invitation.tenant_id;

  update public.tenant_invitations i
  set used_at = now(), updated_at = now()
  where i.id = v_invitation.id;

  select t.company_name into v_company_name from public.tenants t where t.id = v_invitation.tenant_id;
  insert into public.tenant_access_audit (tenant_id, invitation_id, actor, action)
  values (v_invitation.tenant_id, v_invitation.id, v_invitation.tenant_user_id::text, 'invitation_consumed');

  return query select v_invitation.tenant_user_id, v_invitation.tenant_id,
    v_invitation.email_normalized, v_invitation.role, v_company_name;
end;
$$;

create or replace function public.platform_active_tenant_user_by_email_v2(p_email text)
returns table (
  user_id uuid, tenant_id text, email_normalized text, role text, active boolean,
  password_hash text, password_salt text, company_name text
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  perform public.platform_require_service_role_v2();
  return query
  select u.user_id, u.tenant_id, u.email_normalized, u.role, u.active,
    u.password_hash, u.password_salt, t.company_name
  from public.tenant_users u
  join public.tenants t on t.id = u.tenant_id
  where u.email_normalized = lower(btrim(p_email)) and u.status = 'active' and u.active
  limit 1;
end;
$$;

create or replace function public.platform_list_customer_invitations_v2()
returns table (
  id uuid, tenant_id text, email_normalized text, company_name text,
  plan_id text, assigned_bot_id text, role text, delivery_status text,
  delivery_error text, created_at timestamptz, expires_at timestamptz,
  delivered_at timestamptz, used_at timestamptz, revoked_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  perform public.platform_require_service_role_v2();
  return query
  select i.id, i.tenant_id, i.email_normalized, t.company_name,
    t.plan_id, t.assigned_bot_id, i.role, i.delivery_status,
    i.delivery_error, i.created_at, i.expires_at, i.delivered_at,
    i.used_at, i.revoked_at
  from public.tenant_invitations i
  join public.tenants t on t.id = i.tenant_id
  order by i.created_at desc;
end;
$$;

create or replace function public.platform_revoke_customer_invitation_v2(p_invitation_id uuid, p_actor text)
returns setof public.tenant_invitations
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_row public.tenant_invitations%rowtype;
begin
  perform public.platform_require_service_role_v2();
  select * into v_row from public.tenant_invitations i where i.id = p_invitation_id for update;
  if v_row.id is null then raise exception 'INVALID_INVITATION'; end if;
  if v_row.used_at is not null then raise exception 'INVITATION_ALREADY_USED'; end if;
  if v_row.revoked_at is null then
    update public.tenant_invitations i set revoked_at = now(), updated_at = now() where i.id = p_invitation_id returning * into v_row;
    insert into public.tenant_access_audit (tenant_id, invitation_id, actor, action)
    values (v_row.tenant_id, v_row.id, left(p_actor, 160), 'invitation_revoked');
  end if;
  return next v_row;
end;
$$;

revoke all on function public.platform_require_service_role_v2() from public, anon, authenticated;
revoke all on function public.platform_customer_access_catalogs_v2() from public, anon, authenticated;
revoke all on function public.platform_create_customer_invitation_v2(text, text, text, text, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.platform_update_invitation_delivery_v2(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.platform_get_customer_invitation_v2(text, text) from public, anon, authenticated;
revoke all on function public.platform_consume_customer_invitation_v2(text, text, text, text) from public, anon, authenticated;
revoke all on function public.platform_active_tenant_user_by_email_v2(text) from public, anon, authenticated;
revoke all on function public.platform_list_customer_invitations_v2() from public, anon, authenticated;
revoke all on function public.platform_revoke_customer_invitation_v2(uuid, text) from public, anon, authenticated;

grant execute on function public.platform_require_service_role_v2() to service_role;
grant execute on function public.platform_customer_access_catalogs_v2() to service_role;
grant execute on function public.platform_create_customer_invitation_v2(text, text, text, text, text, timestamptz, text) to service_role;
grant execute on function public.platform_update_invitation_delivery_v2(uuid, text, text, text) to service_role;
grant execute on function public.platform_get_customer_invitation_v2(text, text) to service_role;
grant execute on function public.platform_consume_customer_invitation_v2(text, text, text, text) to service_role;
grant execute on function public.platform_active_tenant_user_by_email_v2(text) to service_role;
grant execute on function public.platform_list_customer_invitations_v2() to service_role;
grant execute on function public.platform_revoke_customer_invitation_v2(uuid, text) to service_role;

commit;
