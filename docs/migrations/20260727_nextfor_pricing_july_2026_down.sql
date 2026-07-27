-- Rollback del catálogo comercial NextforIA Julio 2026.
-- No borra datos: solo desactiva los planes nuevos y reactiva los históricos.

begin;

update public.platform_plans
set active = false,
    updated_at = now()
where id in (
  'nextfor-uno',
  'nextfor-aura',
  'nextfor-tempo',
  'nextfor-atlas',
  'nextfor-signature'
);

update public.platform_plans
set active = true,
    updated_at = now()
where id in ('starter', 'growth', 'scale');

commit;
