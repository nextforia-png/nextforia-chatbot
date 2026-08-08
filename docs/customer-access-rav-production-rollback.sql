-- Run only if rollback is approved. Fails if new dependent data appeared.
begin;

do $$
begin
  if exists (
    select 1 from public.tenant_users
    where tenant_id = 'rav-toys-adac1e'
      and not (
        user_id = 'b1e62906-65c6-4a4a-ac86-571b377451c5'::uuid
        and email_normalized = 'ventas@ravtoys.com'
      )
  ) then
    raise exception 'ROLLBACK_BLOCKED_NEW_RAV_MEMBERSHIP';
  end if;
end;
$$;

delete from public.tenant_users
where user_id = 'b1e62906-65c6-4a4a-ac86-571b377451c5'::uuid
  and tenant_id = 'rav-toys-adac1e'
  and email_normalized = 'ventas@ravtoys.com'
  and auth_provider = 'supabase';

delete from public.tenants
where id = 'rav-toys-adac1e'
  and company_name = 'RAV Toys'
  and plan_id is null
  and assigned_bot_id is null
  and not exists (
    select 1 from public.tenant_users where tenant_id = 'rav-toys-adac1e'
  );

commit;
