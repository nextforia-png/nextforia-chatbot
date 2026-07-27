-- Actualiza el catálogo comercial de NextforIA con precios Julio 2026.
-- Staging primero. No aplicar a Producción sin aprobación explícita.
-- Reglas:
--   - No hay setup cost: todos los planes quedan con precio_setup = 0.
--   - Nextfor Signature no tiene precio fijo: se guarda precio_mensual = 0
--     por compatibilidad de schema y se presenta como "A definir".
--   - No se borran planes viejos ni registros existentes.

begin;

insert into public.platform_bots (id, name, descripcion, orden, active, updated_at)
values
  ('atencion-cliente', 'Atención al cliente', 'Atiende, orienta, responde preguntas y escala casos a humanos.', 1, true, now()),
  ('agendamiento', 'Agendamiento', 'Agenda, confirma, reprograma y recuerda citas o reservas.', 2, true, now()),
  ('commerce', 'Commerce', 'Consulta productos, precios, disponibilidad y pedidos cuando aplique.', 3, true, now())
on conflict (id) do update set
  name = excluded.name,
  descripcion = excluded.descripcion,
  orden = excluded.orden,
  active = true,
  updated_at = now();

insert into public.platform_plans as pl (
  id, name, descripcion, bot_id, precio_setup, precio_mensual,
  chats_incluidos, beneficios, etiqueta, orden, active, updated_at
)
values
  (
    'nextfor-uno',
    'Nextfor Uno',
    'El primer paso para dejar de hacerlo todo tú: atención automática por WhatsApp 24/7.',
    'atencion-cliente',
    0,
    49900,
    null,
    '["Atención automática por WhatsApp", "Respuestas sobre productos, horarios y ubicación", "Captura de interesados", "Panel básico de conversaciones"]'::jsonb,
    'Desde $49.900',
    1,
    true,
    now()
  ),
  (
    'nextfor-aura',
    'Nextfor Aura',
    'Tu negocio siempre presente: atiende, orienta y vende por tus canales 24/7.',
    'atencion-cliente',
    0,
    299900,
    null,
    '["Atiende como tu mejor colaborador", "Convierte conversaciones en ventas", "Conecta tienda, productos y pedidos", "Métricas desde el panel"]'::jsonb,
    'Atención + ventas',
    2,
    true,
    now()
  ),
  (
    'nextfor-tempo',
    'Nextfor Tempo',
    'Más citas y reservas, menos tiempo coordinando: agenda y confirma 24/7.',
    'agendamiento',
    0,
    299900,
    null,
    '["Agenda 24/7", "Reprograma, cancela y confirma", "Recordatorios", "Conexión con calendario"]'::jsonb,
    'Agendamiento',
    3,
    true,
    now()
  ),
  (
    'nextfor-atlas',
    'Nextfor Atlas',
    'Atiende, vende y agenda en un solo lugar.',
    null,
    0,
    499900,
    null,
    '["Atiende y vende 24/7", "Gestiona citas o reservas", "Integra tienda y calendarios", "Reportes de ventas, citas y conversaciones"]'::jsonb,
    'Todo en uno',
    4,
    true,
    now()
  ),
  (
    'nextfor-signature',
    'Nextfor Signature',
    'Solución a la medida de cada empresa, con procesos, canales e integraciones personalizados.',
    null,
    0,
    0,
    null,
    '["Propuesta personalizada", "Integraciones a medida", "Alcance definido con el cliente"]'::jsonb,
    'A definir',
    5,
    true,
    now()
  )
on conflict (id) do update set
  name = excluded.name,
  descripcion = excluded.descripcion,
  bot_id = excluded.bot_id,
  precio_setup = 0,
  precio_mensual = excluded.precio_mensual,
  chats_incluidos = excluded.chats_incluidos,
  beneficios = excluded.beneficios,
  etiqueta = excluded.etiqueta,
  orden = excluded.orden,
  active = true,
  updated_at = now();

-- Los planes antiguos quedan disponibles para clientes ya existentes por
-- referencia histórica, pero no se ofrecen a nuevos clientes.
update public.platform_plans
set active = false,
    precio_setup = 0,
    updated_at = now()
where id in ('starter', 'growth', 'scale');

-- A partir de esta decisión comercial, ningún tenant/contrato activo debe
-- mostrar setup cost pendiente.
update public.tenants
set precio_setup_contratado = 0
where precio_setup_contratado is distinct from 0;

do $$
begin
  if to_regclass('public.billing_contracts') is not null then
    update public.billing_contracts
    set contracted_setup_price = 0,
        updated_at = now()
    where contracted_setup_price is distinct from 0;
  end if;
end
$$;

commit;
