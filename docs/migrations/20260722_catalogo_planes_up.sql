-- Catálogo editable de planes y bots + snapshot de precio contratado + ciclo de vida del tenant.
-- Proyecto Supabase de Staging de NextforIA. No aplicar a Producción sin aprobación explícita.
-- Depende de 20260721_customer_access_v2_up.sql.

begin;

-- ---------------------------------------------------------------------------
-- 1. Catálogo de bots: descripción y orden de presentación.
-- ---------------------------------------------------------------------------
alter table public.platform_bots
  add column if not exists descripcion text not null default '',
  add column if not exists orden integer not null default 0;

create index if not exists platform_bots_orden_idx
  on public.platform_bots (orden, id);

-- ---------------------------------------------------------------------------
-- 2. Catálogo de planes: contrato congelado acordado con el agente de Panel de Cliente.
--    Precios en pesos colombianos, enteros, sin decimales. El formateo es de presentación.
-- ---------------------------------------------------------------------------
alter table public.platform_plans
  add column if not exists descripcion text not null default '',
  add column if not exists bot_id text references public.platform_bots(id),
  add column if not exists precio_setup integer not null default 0,
  add column if not exists precio_mensual integer not null default 0,
  add column if not exists chats_incluidos integer,
  add column if not exists beneficios jsonb not null default '[]'::jsonb,
  add column if not exists etiqueta text,
  add column if not exists orden integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'platform_plans_precios_no_negativos') then
    alter table public.platform_plans
      add constraint platform_plans_precios_no_negativos
      check (precio_setup >= 0 and precio_mensual >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'platform_plans_chats_incluidos_positivo') then
    alter table public.platform_plans
      add constraint platform_plans_chats_incluidos_positivo
      check (chats_incluidos is null or chats_incluidos >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'platform_plans_beneficios_es_arreglo') then
    alter table public.platform_plans
      add constraint platform_plans_beneficios_es_arreglo
      check (jsonb_typeof(beneficios) = 'array');
  end if;
end
$$;

create index if not exists platform_plans_orden_idx
  on public.platform_plans (orden, id);

-- ---------------------------------------------------------------------------
-- 3. Snapshot del precio contratado.
--    Se copia del plan al momento de crear el cliente. Si Santiago sube un precio,
--    los clientes ya firmados conservan el suyo. Sin esto no se puede reconstruir después.
--    La regla de vigencia (12 meses en contratos anuales) se define más adelante.
-- ---------------------------------------------------------------------------
alter table public.tenants
  add column if not exists precio_setup_contratado integer,
  add column if not exists precio_mensual_contratado integer,
  add column if not exists plan_contratado_en timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tenants_precios_contratados_no_negativos') then
    alter table public.tenants
      add constraint tenants_precios_contratados_no_negativos
      check (
        (precio_setup_contratado is null or precio_setup_contratado >= 0)
        and (precio_mensual_contratado is null or precio_mensual_contratado >= 0)
      );
  end if;
end
$$;

-- Se copia por trigger y no desde la aplicación, a propósito: así el snapshot
-- queda garantizado sin importar qué código cree el cliente (RPC de invitación,
-- carga manual o cualquier flujo futuro). Solo escribe si viene vacío, de modo
-- que una corrección manual del precio de un contrato nunca se pisa sola.
create or replace function public.platform_snapshot_precio_contratado_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  plan_setup integer;
  plan_mensual integer;
begin
  if new.precio_setup_contratado is null or new.precio_mensual_contratado is null then
    select p.precio_setup, p.precio_mensual into plan_setup, plan_mensual
      from public.platform_plans p where p.id = new.plan_id;
    new.precio_setup_contratado := coalesce(new.precio_setup_contratado, plan_setup, 0);
    new.precio_mensual_contratado := coalesce(new.precio_mensual_contratado, plan_mensual, 0);
    new.plan_contratado_en := coalesce(new.plan_contratado_en, now());
  end if;
  return new;
end;
$$;

drop trigger if exists tenants_snapshot_precio on public.tenants;
create trigger tenants_snapshot_precio
  before insert on public.tenants
  for each row execute function public.platform_snapshot_precio_contratado_v1();

-- Clientes ya existentes: se les asigna el precio vigente del plan una sola vez,
-- para que ninguno quede sin snapshot.
update public.tenants t
  set precio_setup_contratado = coalesce(t.precio_setup_contratado, p.precio_setup, 0),
      precio_mensual_contratado = coalesce(t.precio_mensual_contratado, p.precio_mensual, 0),
      plan_contratado_en = coalesce(t.plan_contratado_en, t.created_at, now())
  from public.platform_plans p
  where p.id = t.plan_id
    and (t.precio_setup_contratado is null or t.precio_mensual_contratado is null);

-- ---------------------------------------------------------------------------
-- 4. Ciclo de vida del tenant.
--    El constraint anterior permitía setup/pilot/live/paused. El contrato nuevo pide
--    setup/activo/suspendido/archivado. Se admiten AMBOS conjuntos para no romper filas
--    existentes ni el código del otro agente. Los estados heredados quedan como alias:
--      live   -> activo
--      paused -> suspendido
--      pilot  -> se conserva (piloto comercial, no es un estado de acceso)
--    Migrar los datos y retirar los heredados es un paso posterior y deliberado.
-- ---------------------------------------------------------------------------
alter table public.tenants drop constraint if exists tenants_status_values;
alter table public.tenants
  add constraint tenants_status_values
  check (status in ('setup', 'pilot', 'live', 'paused', 'activo', 'suspendido', 'archivado'));

create index if not exists tenants_status_idx on public.tenants (status);

-- ---------------------------------------------------------------------------
-- 5. Auditoría: acciones nuevas de catálogo y ciclo de vida.
-- ---------------------------------------------------------------------------
alter table public.tenant_access_audit drop constraint if exists tenant_access_audit_action;
alter table public.tenant_access_audit
  add constraint tenant_access_audit_action check (action in (
    'tenant_invitation_created',
    'invitation_delivered',
    'invitation_delivery_failed',
    'invitation_consumed',
    'invitation_revoked',
    'tenant_user_login',
    'plan_upserted',
    'bot_upserted',
    'plan_toggled',
    'tenant_status_changed',
    'tenant_deleted'
  ));

-- ---------------------------------------------------------------------------
-- 6. Lectura del catálogo.
--    platform_customer_access_catalogs_v2 conserva su firma y su semántica (solo activos)
--    pero ahora devuelve el contrato completo. Los consumidores que solo leían id/name
--    siguen funcionando: los campos anteriores están presentes.
-- ---------------------------------------------------------------------------
create or replace function public.platform_customer_access_catalogs_v2()
returns table (plans jsonb, bots jsonb)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  perform public.platform_require_service_role_v2();
  return query select
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'nombre', p.name,
        'descripcion', p.descripcion,
        'bot_id', p.bot_id,
        'precio_setup', p.precio_setup,
        'precio_mensual', p.precio_mensual,
        'chats_incluidos', p.chats_incluidos,
        'beneficios', p.beneficios,
        'etiqueta', p.etiqueta,
        'activo', p.active,
        'orden', p.orden
      ) order by p.orden, p.id)
      from public.platform_plans p where p.active
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id,
        'name', b.name,
        'nombre', b.name,
        'descripcion', b.descripcion,
        'activo', b.active,
        'orden', b.orden
      ) order by b.orden, b.id)
      from public.platform_bots b where b.active
    ), '[]'::jsonb);
end;
$$;

-- Catálogo completo para la pantalla de administración: incluye inactivos,
-- porque desde ahí se reactivan.
create or replace function public.platform_catalogs_admin_v1()
returns table (plans jsonb, bots jsonb)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  perform public.platform_require_service_role_v2();
  return query select
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'nombre', p.name,
        'descripcion', p.descripcion,
        'bot_id', p.bot_id,
        'precio_setup', p.precio_setup,
        'precio_mensual', p.precio_mensual,
        'chats_incluidos', p.chats_incluidos,
        'beneficios', p.beneficios,
        'etiqueta', p.etiqueta,
        'activo', p.active,
        'orden', p.orden,
        'created_at', p.created_at,
        'updated_at', p.updated_at
      ) order by p.orden, p.id)
      from public.platform_plans p
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id,
        'nombre', b.name,
        'descripcion', b.descripcion,
        'activo', b.active,
        'orden', b.orden
      ) order by b.orden, b.id)
      from public.platform_bots b
    ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Escritura del catálogo.
-- ---------------------------------------------------------------------------
create or replace function public.platform_upsert_plan_v1(
  p_id text,
  p_nombre text,
  p_descripcion text,
  p_bot_id text,
  p_precio_setup integer,
  p_precio_mensual integer,
  p_chats_incluidos integer,
  p_beneficios jsonb,
  p_etiqueta text,
  p_orden integer,
  p_actor text
)
returns public.platform_plans
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  fila public.platform_plans;
begin
  perform public.platform_require_service_role_v2();

  if p_bot_id is not null and not exists (select 1 from public.platform_bots where id = p_bot_id) then
    raise exception 'INVALID_BOT' using errcode = '23503';
  end if;

  insert into public.platform_plans as pl (
    id, name, descripcion, bot_id, precio_setup, precio_mensual,
    chats_incluidos, beneficios, etiqueta, orden, updated_at
  )
  values (
    p_id, p_nombre, coalesce(p_descripcion, ''), p_bot_id,
    coalesce(p_precio_setup, 0), coalesce(p_precio_mensual, 0),
    p_chats_incluidos, coalesce(p_beneficios, '[]'::jsonb),
    p_etiqueta, coalesce(p_orden, 0), now()
  )
  on conflict (id) do update set
    name = excluded.name,
    descripcion = excluded.descripcion,
    bot_id = excluded.bot_id,
    precio_setup = excluded.precio_setup,
    precio_mensual = excluded.precio_mensual,
    chats_incluidos = excluded.chats_incluidos,
    beneficios = excluded.beneficios,
    etiqueta = excluded.etiqueta,
    orden = excluded.orden,
    updated_at = now()
  returning pl.* into fila;

  insert into public.tenant_access_audit (actor, action, metadata)
  values (coalesce(p_actor, 'desconocido'), 'plan_upserted', jsonb_build_object('plan_id', fila.id));

  return fila;
end;
$$;

create or replace function public.platform_upsert_bot_v1(
  p_id text,
  p_nombre text,
  p_descripcion text,
  p_orden integer,
  p_actor text
)
returns public.platform_bots
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  fila public.platform_bots;
begin
  perform public.platform_require_service_role_v2();

  insert into public.platform_bots as bo (id, name, descripcion, orden, updated_at)
  values (p_id, p_nombre, coalesce(p_descripcion, ''), coalesce(p_orden, 0), now())
  on conflict (id) do update set
    name = excluded.name,
    descripcion = excluded.descripcion,
    orden = excluded.orden,
    updated_at = now()
  returning bo.* into fila;

  insert into public.tenant_access_audit (actor, action, metadata)
  values (coalesce(p_actor, 'desconocido'), 'bot_upserted', jsonb_build_object('bot_id', fila.id));

  return fila;
end;
$$;

create or replace function public.platform_toggle_plan_v1(
  p_id text,
  p_activo boolean,
  p_actor text
)
returns public.platform_plans
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  fila public.platform_plans;
begin
  perform public.platform_require_service_role_v2();

  update public.platform_plans
    set active = coalesce(p_activo, false), updated_at = now()
    where id = p_id
    returning * into fila;

  if fila.id is null then
    raise exception 'PLAN_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.tenant_access_audit (actor, action, metadata)
  values (coalesce(p_actor, 'desconocido'), 'plan_toggled',
          jsonb_build_object('plan_id', fila.id, 'activo', fila.active));

  return fila;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Ciclo de vida del cliente.
-- ---------------------------------------------------------------------------
create or replace function public.platform_set_tenant_status_v1(
  p_tenant_id text,
  p_status text,
  p_actor text
)
returns public.tenants
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  fila public.tenants;
  anterior text;
begin
  perform public.platform_require_service_role_v2();

  if p_status not in ('setup', 'activo', 'suspendido', 'archivado') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;

  select status into anterior from public.tenants where id = p_tenant_id;
  if anterior is null then
    raise exception 'TENANT_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.tenants
    set status = p_status, updated_at = now()
    where id = p_tenant_id
    returning * into fila;

  -- Suspender corta el acceso pero conserva todos los datos: los usuarios quedan
  -- inactivos y se reactivan al volver a 'activo'.
  if p_status in ('suspendido', 'archivado') then
    update public.tenant_users set active = false, updated_at = now() where tenant_id = p_tenant_id;
  elsif p_status = 'activo' then
    update public.tenant_users
      set active = true, updated_at = now()
      where tenant_id = p_tenant_id and status = 'active';
  end if;

  insert into public.tenant_access_audit (tenant_id, actor, action, metadata)
  values (p_tenant_id, coalesce(p_actor, 'desconocido'), 'tenant_status_changed',
          jsonb_build_object('anterior', anterior, 'nuevo', p_status));

  return fila;
end;
$$;

-- Listado de clientes con estado y precio contratado. Alimenta la vista de
-- Clientes del Super Admin: sin estado no se puede suspender ni eliminar.
create or replace function public.platform_list_tenants_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  resultado jsonb;
begin
  perform public.platform_require_service_role_v2();
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'company_name', t.company_name,
    'plan_id', t.plan_id,
    'assigned_bot_id', t.assigned_bot_id,
    'status', t.status,
    'precio_setup_contratado', t.precio_setup_contratado,
    'precio_mensual_contratado', t.precio_mensual_contratado,
    'plan_contratado_en', t.plan_contratado_en,
    'usuarios_activos', (select count(*) from public.tenant_users u where u.tenant_id = t.id and u.active),
    'created_at', t.created_at
  ) order by t.created_at desc), '[]'::jsonb)
  into resultado
  from public.tenants t;
  return resultado;
end;
$$;

-- Respaldo completo antes de borrar. Nunca incluye hashes de contraseña ni tokens.
create or replace function public.platform_tenant_backup_v1(p_tenant_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  resultado jsonb;
begin
  perform public.platform_require_service_role_v2();

  select jsonb_build_object(
    'generado_en', now(),
    'tenant', (select to_jsonb(t) from public.tenants t where t.id = p_tenant_id),
    'usuarios', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', u.user_id, 'email', u.email_normalized, 'role', u.role,
        'status', u.status, 'active', u.active, 'created_at', u.created_at
      ))
      from public.tenant_users u where u.tenant_id = p_tenant_id
    ), '[]'::jsonb),
    'invitaciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'email', i.email_normalized, 'role', i.role,
        'delivery_status', i.delivery_status, 'created_at', i.created_at,
        'used_at', i.used_at, 'revoked_at', i.revoked_at
      ))
      from public.tenant_invitations i where i.tenant_id = p_tenant_id
    ), '[]'::jsonb),
    'auditoria', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.created_at)
      from public.tenant_access_audit a where a.tenant_id = p_tenant_id
    ), '[]'::jsonb)
  ) into resultado;

  if resultado->'tenant' is null or resultado->'tenant' = 'null'::jsonb then
    raise exception 'TENANT_NOT_FOUND' using errcode = 'P0002';
  end if;

  return resultado;
end;
$$;

create or replace function public.platform_delete_tenant_v1(
  p_tenant_id text,
  p_company_name_confirmacion text,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  fila public.tenants;
begin
  perform public.platform_require_service_role_v2();

  select * into fila from public.tenants where id = p_tenant_id;
  if fila.id is null then
    raise exception 'TENANT_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Salvaguarda 1: solo se puede eliminar un cliente ya suspendido.
  if fila.status not in ('suspendido', 'archivado') then
    raise exception 'TENANT_NOT_SUSPENDED' using errcode = '22023';
  end if;

  -- Salvaguarda 2: el nombre exacto de la empresa debe coincidir.
  if btrim(coalesce(p_company_name_confirmacion, '')) <> btrim(fila.company_name) then
    raise exception 'COMPANY_NAME_MISMATCH' using errcode = '22023';
  end if;

  -- La auditoría sobrevive al borrado: queda constancia de quién eliminó qué y cuándo.
  insert into public.tenant_access_audit (tenant_id, actor, action, metadata)
  values (null, coalesce(p_actor, 'desconocido'), 'tenant_deleted',
          jsonb_build_object(
            'tenant_id', fila.id,
            'company_name', fila.company_name,
            'plan_id', fila.plan_id,
            'eliminado_en', now()
          ));

  update public.tenant_access_audit set tenant_id = null where tenant_id = p_tenant_id;
  delete from public.tenant_invitations where tenant_id = p_tenant_id;
  delete from public.tenant_users where tenant_id = p_tenant_id;
  delete from public.tenants where id = p_tenant_id;

  return jsonb_build_object('ok', true, 'tenant_id', fila.id, 'company_name', fila.company_name);
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Permisos: mismo criterio que la migración anterior. Nada accesible sin service_role.
-- ---------------------------------------------------------------------------
revoke all on function public.platform_catalogs_admin_v1() from public, anon, authenticated;
revoke all on function public.platform_upsert_plan_v1(text, text, text, text, integer, integer, integer, jsonb, text, integer, text) from public, anon, authenticated;
revoke all on function public.platform_upsert_bot_v1(text, text, text, integer, text) from public, anon, authenticated;
revoke all on function public.platform_toggle_plan_v1(text, boolean, text) from public, anon, authenticated;
revoke all on function public.platform_set_tenant_status_v1(text, text, text) from public, anon, authenticated;
revoke all on function public.platform_list_tenants_v1() from public, anon, authenticated;
revoke all on function public.platform_tenant_backup_v1(text) from public, anon, authenticated;
revoke all on function public.platform_delete_tenant_v1(text, text, text) from public, anon, authenticated;

grant execute on function public.platform_catalogs_admin_v1() to service_role;
grant execute on function public.platform_upsert_plan_v1(text, text, text, text, integer, integer, integer, jsonb, text, integer, text) to service_role;
grant execute on function public.platform_upsert_bot_v1(text, text, text, integer, text) to service_role;
grant execute on function public.platform_toggle_plan_v1(text, boolean, text) to service_role;
grant execute on function public.platform_set_tenant_status_v1(text, text, text) to service_role;
grant execute on function public.platform_list_tenants_v1() to service_role;
grant execute on function public.platform_tenant_backup_v1(text) to service_role;
grant execute on function public.platform_delete_tenant_v1(text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 10. Semilla mínima: deja los planes existentes con orden y bot asignado coherentes.
--     No inventa precios: quedan en 0 hasta que Santiago los cargue desde el panel.
-- ---------------------------------------------------------------------------
update public.platform_bots set orden = 1, descripcion = 'Responde preguntas y atiende clientes 24/7.' where id = 'atencion-cliente' and orden = 0;
update public.platform_bots set orden = 2, descripcion = 'Agenda, confirma y reprograma citas.' where id = 'agendamiento' and orden = 0;
update public.platform_bots set orden = 3, descripcion = 'Recomienda productos y acompaña la compra.' where id = 'commerce' and orden = 0;

update public.platform_plans set orden = 1 where id = 'starter' and orden = 0;
update public.platform_plans set orden = 2 where id = 'growth' and orden = 0;
update public.platform_plans set orden = 3 where id = 'scale' and orden = 0;

commit;
