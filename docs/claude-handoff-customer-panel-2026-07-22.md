# Handoff a Claude — Customer Panel multi-tenant

Fecha: 22 de julio de 2026

Repositorio: `ravtoys/rav-whatsapp-bot`

Worktree: `/Users/santiagovelasquez/Documents/NexforIA Bots-staging-customer-panel`

Rama: `codex/staging-customer-panel`

## Restricciones vigentes

- Trabajar únicamente en Customer Panel Staging.
- No tocar producción, `nextforia.com`, landing ni `rav-app` / RAV Club.
- Mantener `CUSTOMER_ACCESS_V2_ENABLED` como gate.
- No crear signup público, usernames, tenants ni otro flujo de acceso.
- Contrato congelado: `docs/customer-access-contract.md` (`741c4b8`).
- Implementación base de Super Admin: `0c8528b`.

## Estado desplegado antes de esta corrección

- Staging: `https://staging.nextforia.com`
- Commit desplegado: `1b5e7452b34b33b984ff5e9f4d01954e05fa15b7`
- Versión: `v89-staging-customer-access-v2`
- Supabase y Resend de Staging están aislados y el flujo invitación → setup → login fue validado en vivo.
- Producción continúa en `v88`, sin cambios.

## Trabajo ya completado

### Customer Access v2

- Invitación privada creada únicamente por Super Admin.
- Setup con correo invitado de solo lectura y contraseña/confirmación.
- Login exclusivo por email + contraseña para clientes v2.
- Token hasheado, single-use, revocable, con expiración y consumo atómico.
- Sesión v2 firmada y revalidada contra membresía activa en cada request `/admin`.
- Tenant efectivo derivado de la sesión; query/body/URL no pueden reemplazarlo.
- Lectura/escritura A/B, cookie alterada, membresía inactiva y ausencia de signup cubiertos por E2E.

### Corrección nueva de branding tenant-aware

- `SupabaseCustomerAccessStore.activeUserByEmail()` carga el tenant autenticado desde `/rest/v1/tenants`, filtrado por el `tenant_id` de la membresía activa.
- La sesión revalidada incorpora `company_name`, `plan_id`, `assigned_bot_id` y `tenant_status`.
- `/admin/panel` pasa ese contexto al renderer solo para sesiones v2.
- El HTML inicial muestra nombre, iniciales, plan y bot del tenant antes de cargar métricas.
- Sesiones v2 muestran un solo selector de bot: únicamente el bot asignado.
- Atención al cliente no muestra el selector de Agendamiento; Agendamiento no muestra el selector de Atención.
- Un tenant de Agendamiento abre directamente su módulo incluso si solicita `?tab=summary`.
- El panel `Mi plan` v2 elimina ofertas/promociones de bots no asignados y presenta solo el módulo contratado.
- Respuestas sugeridas, código de referidos, perfil y setup usan el nombre del negocio autenticado, no RAV Toys.
- `/admin/panel/appointments-data` ahora deriva el tenant de la sesión y no del tenant legado.
- Con gate apagado se conservan el branding y los dos selectores del panel legado.
- Versión preparada: `v90-staging-tenant-branding`.

## Archivos modificados

- `customer-access-v2.js`
- `customer-access-v2.test.js`
- `customer-panel.js`
- `customer-panel-tenant-context.test.js` (nuevo)
- `customer-panel-access-v2.e2e.test.js`
- `index.js`
- `package.json`
- `docs/customer-panel-access-staging.md`
- este handoff

## Pruebas ejecutadas y aprobadas

- `node --check index.js`
- `node --check customer-panel.js`
- `node --check customer-access-v2.js`
- `pnpm test` — suite completa verde, incluyendo gate OFF legado y gate ON A/B.
- `pnpm security:scan` — `ok: true`, sin fallos ni advertencias.
- `git diff --check` — limpio.

Casos nuevos cubiertos:

- Tenant A: Empresa A / Growth / Atención al cliente.
- Tenant B: Empresa B / Scale / Agendamiento.
- Sin branding cruzado A ↔ B.
- Solo aparece el bot asignado.
- El tenant de URL/query se ignora.
- Appointments data de B permanece en B.
- El renderer escapa nombres de empresa con HTML malicioso.
- Gate OFF conserva RAV Toys, ambos selectores y textos legado principales.

## Pendiente exacto

El usuario pidió el handoff cuando estaba empezando el QA visual. La suite y seguridad están completas, pero falta terminar la inspección visual navegada:

1. Levantar local con `CUSTOMER_ACCESS_V2_ENABLED=1` y fixtures A/B.
2. Login como Empresa A y verificar escritorio 1280×720 y móvil 390×844:
   - Empresa A e iniciales EA.
   - Plan Growth.
   - `1 bot activo`.
   - Solo Atención al cliente.
   - Ningún texto visible RAV Toys o Empresa B.
3. Login como Empresa B y repetir:
   - Empresa B e iniciales EB.
   - Plan Scale.
   - Solo Agendamiento.
   - Apertura directa del módulo Citas.
4. Revisar overflow horizontal, consola y errores de carga.
5. Desplegar el SHA de esta rama únicamente a Staging y repetir la verificación live.
6. Confirmar `/admin/health` con `v90-staging-tenant-branding`.

## Observaciones para la siguiente iteración

- La revalidación v2 hace una consulta RPC de membresía y una consulta REST al tenant por request autenticado. Es segura y está probada, pero conviene medir latencia/caché después del QA live.
- No se requiere migración SQL nueva para esta corrección.
- `Bot setup` y `Retargeting` siguen siendo rutas legado limitadas al tenant por defecto; para sesiones v2 no-default responden `401`. No se generalizaron en este cambio. Antes de exponer esos módulos como operativos a clientes multi-tenant, deben migrarse con el mismo patrón tenant-bound o esconderse hasta estar listos.
- El renderer mantiene paneles internos compartidos, pero la navegación v2 bloquea módulos de bot no asignados y no renderiza sus selectores ni ofertas visibles.

## Rollback

- Rollback inmediato del flujo completo: `CUSTOMER_ACCESS_V2_ENABLED=0`.
- Rollback de esta corrección visual: volver al commit `1b5e7452b34b33b984ff5e9f4d01954e05fa15b7` en Staging.
- No aplicar cambios ni rollback en producción sin aprobación explícita.
