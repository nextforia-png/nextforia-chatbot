-- Preserve the canonical tenant ID for pre-registered pilots.
begin;

create or replace function public.platform_create_registered_customer_invitation_v1(
  p_registered_tenant_id text,
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
  v_tenant_id text := lower(btrim(p_registered_tenant_id));
  v_email text := lower(btrim(p_admin_email));
  v_tenant public.tenants%rowtype;
  v_user public.tenant_users%rowtype;
  v_invitation public.tenant_invitations%rowtype;
begin
  perform public.platform_require_service_role_v2();
  if v_tenant_id !~ '^[a-z0-9][a-z0-9_-]{1,79}$' then
    raise exception 'INVALID_REQUEST';
  end if;
  if not exists (select 1 from public.platform_plans where platform_plans.id = p_plan_id and active) then
    raise exception 'INVALID_PLAN';
  end if;
  if not exists (select 1 from public.platform_bots where platform_bots.id = p_assigned_bot_id and active) then
    raise exception 'INVALID_ASSIGNED_BOT';
  end if;
  if exists (select 1 from public.tenant_users where tenant_users.email_normalized = v_email) then
    raise exception 'CUSTOMER_ALREADY_EXISTS';
  end if;
  if exists (
    select 1 from public.tenants
    where tenants.id = v_tenant_id
       or lower(btrim(tenants.company_name)) = lower(btrim(p_company_name))
  ) then
    raise exception 'CUSTOMER_ALREADY_EXISTS';
  end if;

  insert into public.tenants (id, company_name, plan_id, assigned_bot_id, status)
  values (v_tenant_id, btrim(p_company_name), p_plan_id, p_assigned_bot_id, 'setup')
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
    'registered_tenant_invitation_created',
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

revoke all on function public.platform_create_registered_customer_invitation_v1(text, text, text, text, text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.platform_create_registered_customer_invitation_v1(text, text, text, text, text, text, timestamptz, text) to service_role;

commit;
