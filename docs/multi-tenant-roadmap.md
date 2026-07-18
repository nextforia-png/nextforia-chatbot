# Roadmap multi-cliente

El bot actual funciona como single-tenant para RAV Toys. Para comercializarlo, la meta es convertirlo en una plataforma donde cada comercio tenga configuracion, dashboard, WhatsApp, catalogo y reglas propias.

## Estado actual

- Un solo `PHONE_NUMBER_ID`.
- Un solo `WA_TOKEN`.
- Un solo `SHOPIFY_STORE_DOMAIN`.
- Un solo `SHOPIFY_ADMIN_TOKEN`.
- Un dashboard operativo para RAV Toys y una vista Super admin v1 separada, ambos sobre datos/configuracion single-tenant y con roles (`super_admin`, `admin`, `agent`, `viewer`).
- Logs persistentes en Supabase `conversation_logs`.

## Objetivo de plataforma

Cada mensaje entrante debe resolverse asi:

```text
Webhook Meta
  -> identificar phone_number_id
  -> cargar tenant
  -> usar token/config del tenant
  -> cargar prompt/reglas/catalogo del tenant
  -> responder o pasar a humano
  -> guardar logs con tenant_id
```

## Modelo recomendado

### tenants

| Campo | Uso |
|---|---|
| `tenant_id` | Slug interno, ejemplo `rav-toys` |
| `brand_name` | Nombre visible del comercio |
| `status` | `setup`, `pilot`, `live`, `paused` |
| `business_manager_id` | ID del BM de Meta |
| `waba_id` | WhatsApp Business Account |
| `phone_number_id` | ID del numero en Cloud API |
| `display_phone` | Numero visible |
| `privacy_policy_url` | URL publica |
| `created_at` | Auditoria |
| `updated_at` | Auditoria |

### tenant_secrets

No deben ir en codigo. Guardar en Render env vars, Supabase Vault o gestor de secretos.

| Campo | Uso |
|---|---|
| `tenant_id` | Relacion con tenant |
| `wa_token` | Token Meta |
| `shopify_admin_token` | Token Admin |
| `anthropic_api_key` | Opcional por cliente si se factura separado |

### tenant_integrations

| Campo | Uso |
|---|---|
| `tenant_id` | Relacion con tenant |
| `shopify_store_domain` | Dominio Shopify |
| `shopify_admin_api_version` | Version Admin API |
| `order_prefixes` | Prefijos tipo `RAV` |
| `catalog_source` | `shopify`, `csv`, `api`, etc. |

### tenant_users

| Campo | Uso |
|---|---|
| `tenant_id` | Relacion con tenant |
| `username` | Login |
| `password_hash` | Hash, nunca texto plano |
| `role` | `admin`, `agent`, `viewer` |
| `active` | Control de acceso |

### platform_users

Usuarios internos de NexforIA. No pertenecen a un tenant unico y deben tener acceso transversal solo desde el panel Super admin.

| Campo | Uso |
|---|---|
| `username` | Login interno |
| `password_hash` | Hash, nunca texto plano |
| `role` | `super_admin` |
| `active` | Control de acceso |
| `allowed_tenants` | Lista opcional de tenants si se quiere restringir soporte |

### conversation_logs

Agregar gradualmente:

- `tenant_id`
- `phone_number_id`
- `channel`
- `customer_id`

## Fases tecnicas

1. Fase A: simulacion multi-cliente
   - [x] Mantener RAV como tenant default configurable por entorno.
   - [x] Preparar `tenant_id`, `phone_number_id` y `channel` en logs nuevos con migracion compatible.
   - [x] Rechazar mensajes de WhatsApp dirigidos a un `phone_number_id` distinto al configurado.
   - Crear endpoint admin de readiness/comercializacion.
   - Mantener `super_admin` como rol de plataforma y `admin` como rol del cliente.
   - Mantener variables actuales para no romper produccion.

2. Fase B: configuracion por tenant
   - Resolver tenant por `phone_number_id` del webhook.
   - Mover Shopify/token/notificaciones a configuracion por tenant.
   - Separar dashboard por tenant.
   - Extender la separacion visual Admin/Super admin de `v60` a datos y configuracion aislados por tenant.

3. Fase C: onboarding autoservicio
   - Boton `Conectar WhatsApp`.
   - Embedded Signup.
   - Captura de WABA ID y phone_number_id.
   - Checklist visual por cliente.

4. Fase D: operacion comercial
   - Facturacion por cliente.
   - Staging por tenant.
   - Export de metricas.
   - SLA/monitoreo por cliente.

## Riesgos que debemos controlar

- Mezclar conversaciones de clientes distintos.
- Exponer tokens o llaves en logs.
- Enviar mensajes con el `phone_number_id` equivocado.
- Permitir que una asesora vea tenants que no le corresponden.
- Permitir que un admin de cliente vea configuracion o conversaciones de otro tenant.
- Prometer tiempos que dependen de Meta.

## Decision recomendada

Antes de implementar Embedded Signup, completar Fase A y B. Eso permite vender demos, preparar pilotos y conectar clientes manualmente sin reescribir el bot completo.
