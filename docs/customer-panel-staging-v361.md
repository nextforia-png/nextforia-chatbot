# Customer Panel Staging v361

Fecha: 2026-08-11

## Alcance

Esta versión parte del árbol exacto de Producción y agrega únicamente la evolución del Customer Panel en Staging. Conserva autenticación, aislamiento por `tenant_id`, canales reales, notificaciones, configuración del bot, Shopify, citas, calendarios y el coordinador Atlas.

## Cambios funcionales

- Navegación móvil primaria de tres destinos: Panel, Chats y Perfil.
- Perfil móvil de pantalla completa con accesos reales a Mi plan, Canales, Configuración y Notificaciones.
- Contador de conversaciones que requieren atención en la navegación móvil.
- OAuth de Google/Microsoft Calendar en pestaña nueva para conservar la sesión del Customer Panel.
- Retargeting de sesiones v2 derivado siempre del tenant firmado; un `tenant_id` de URL o body no puede cambiar el alcance.
- Copy de Citas alineado con la capacidad real: confirmar guarda la cita, pero no promete un mensaje saliente que el backend aún no envía.
- Mi plan muestra catálogo y módulos reales; no presenta consumo, rescates ni referidos sin contrato backend.

## Gates por plan preservados

- Nextfor Uno: Atención al cliente, un bot.
- Nextfor Aura: Atención al cliente, un bot.
- Nextfor Tempo: Agendamiento, un bot.
- Nextfor Atlas: Atención y Agendamiento, dos bots.

## Capacidades no simuladas

Hasta que Core Platform publique contratos persistentes, el panel no debe prometer:

- envío automático al cliente al confirmar una cita;
- scheduler y delivery real de recordatorios;
- CRUD/activación de reglas avanzadas de agenda;
- cambio inmediato de plan desde el cliente;
- llamadas autoprovisionadas;
- pedidos autenticados o envíos de oportunidades sin backend tenant-scoped.

## Verificación

- Suite completa `pnpm test`.
- `pnpm test:channels`.
- `pnpm security:scan`.
- QA visual desktop 1280×720 y móvil 390×844.
- Matriz E2E de tenant A/B, notificaciones, canales, citas, calendarios y gates por plan.

Producción no fue modificada.
