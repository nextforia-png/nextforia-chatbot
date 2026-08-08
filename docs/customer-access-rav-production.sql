-- Approved Production normalization for the existing RAV Toys identity.
-- Preconditions make the transaction fail closed if the live state changed.
begin;

do $$
begin
  if not exists (
    select 1 from auth.users
    where id = 'b1e62906-65c6-4a4a-ac86-571b377451c5'::uuid
      and lower(email) = 'ventas@ravtoys.com'
      and email_confirmed_at is not null
      and deleted_at is null
  ) then
    raise exception 'EXPECTED_RAV_AUTH_IDENTITY_NOT_FOUND';
  end if;
  if exists (select 1 from public.tenants where id = 'rav-toys-adac1e') then
    raise exception 'RAV_OFFICIAL_TENANT_ALREADY_EXISTS';
  end if;
  if exists (
    select 1 from public.tenant_users
    where user_id = 'b1e62906-65c6-4a4a-ac86-571b377451c5'::uuid
       or email_normalized = 'ventas@ravtoys.com'
  ) then
    raise exception 'RAV_MEMBERSHIP_ALREADY_EXISTS';
  end if;
end;
$$;

alter table public.tenants
  alter column plan_id drop not null,
  alter column assigned_bot_id drop not null;

insert into public.tenants (id, company_name, plan_id, assigned_bot_id, status)
values ('rav-toys-adac1e', 'RAV Toys', null, null, 'setup');

insert into public.tenant_users (
  user_id, auth_user_id, tenant_id, email_normalized, auth_provider,
  password_hash, password_salt, role, status, active, session_version
) values (
  'b1e62906-65c6-4a4a-ac86-571b377451c5'::uuid,
  'b1e62906-65c6-4a4a-ac86-571b377451c5'::uuid,
  'rav-toys-adac1e', 'ventas@ravtoys.com', 'supabase',
  null, null, 'admin', 'active', true, 1
);

commit;
