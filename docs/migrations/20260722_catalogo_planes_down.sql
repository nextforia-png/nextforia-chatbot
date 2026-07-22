-- Rollback del catálogo editable de planes y bots.
-- Revierte únicamente lo que introdujo 20260722_catalogo_planes_up.sql.
-- No toca nada de customer_access_v2.
--
-- ADVERTENCIA: al eliminar las columnas se pierden los precios cargados y los
-- snapshots de precio contratado de cada cliente. Exportar antes si se necesitan.

begin;

drop function if exists public.platform_delete_tenant_v1(text, text, text);
drop function if exists public.platform_tenant_backup_v1(text);
drop function if exists public.platform_list_tenants_v1();
drop function if exists public.platform_set_tenant_status_v1(text, text, text);
drop function if exists public.platform_toggle_plan_v1(text, boolean, text);
drop function if exists public.platform_upsert_bot_v1(text, text, text, integer, text);
drop function if exists public.platform_upsert_plan_v1(text, text, text, text, integer, integer, integer, jsonb, text, integer, text);
drop function if exists public.platform_catalogs_admin_v1();

-- Devolver el catálogo a su forma original (solo id y name).
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
revoke all on function public.platform_customer_access_catalogs_v2() from public, anon, authenticated;
grant execute on function public.platform_customer_access_catalogs_v2() to service_role;

-- Devolver los estados heredados. Cualquier fila en un estado nuevo se normaliza
-- al equivalente anterior para que el constraint pueda aplicarse.
update public.tenants set status = 'live'   where status = 'activo';
update public.tenants set status = 'paused' where status in ('suspendido', 'archivado');

alter table public.tenants drop constraint if exists tenants_status_values;
alter table public.tenants
  add constraint tenants_status_values
  check (status in ('setup', 'pilot', 'live', 'paused'));

drop index if exists public.tenants_status_idx;

alter table public.tenant_access_audit drop constraint if exists tenant_access_audit_action;
delete from public.tenant_access_audit
  where action in ('plan_upserted', 'bot_upserted', 'plan_toggled', 'tenant_status_changed', 'tenant_deleted');
alter table public.tenant_access_audit
  add constraint tenant_access_audit_action check (action in (
    'tenant_invitation_created',
    'invitation_delivered',
    'invitation_delivery_failed',
    'invitation_consumed',
    'invitation_revoked',
    'tenant_user_login'
  ));

drop trigger if exists tenants_snapshot_precio on public.tenants;
drop function if exists public.platform_snapshot_precio_contratado_v1();

alter table public.tenants drop constraint if exists tenants_precios_contratados_no_negativos;
alter table public.tenants
  drop column if exists plan_contratado_en,
  drop column if exists precio_mensual_contratado,
  drop column if exists precio_setup_contratado;

drop index if exists public.platform_plans_orden_idx;
alter table public.platform_plans drop constraint if exists platform_plans_beneficios_es_arreglo;
alter table public.platform_plans drop constraint if exists platform_plans_chats_incluidos_positivo;
alter table public.platform_plans drop constraint if exists platform_plans_precios_no_negativos;
alter table public.platform_plans
  drop column if exists orden,
  drop column if exists etiqueta,
  drop column if exists beneficios,
  drop column if exists chats_incluidos,
  drop column if exists precio_mensual,
  drop column if exists precio_setup,
  drop column if exists bot_id,
  drop column if exists descripcion;

drop index if exists public.platform_bots_orden_idx;
alter table public.platform_bots
  drop column if exists orden,
  drop column if exists descripcion;

commit;
