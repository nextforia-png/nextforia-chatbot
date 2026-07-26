# Payments v1 · Wompi Sandbox · Staging

Fecha: 2026-07-25 (America/Bogota)

## Alcance

Payments v1 se implementa exclusivamente en:

- aplicación `https://staging.nextforia.com`;
- servicio Render `nextforia-staging`;
- rama `codex/staging-customer-panel`;
- proyecto Supabase aislado `nextforia-staging`;
- ambiente Sandbox de Wompi.

Producción permanece fuera de alcance hasta aprobación explícita de Santiago.

## Lo que ya existía

- Setup Flow y cuestionario del cliente.
- Catálogo central de Planes y Bots administrado desde Super Admin.
- Selección tenant-bound de plan y bot.
- Precios de setup y mensualidad congelados en el tenant.
- Panel de Cliente multi-tenant y Super Admin separados.
- Staging aislado en Render y Supabase.

## Lo construido

- Paso de activación después del cuestionario y la selección de bot/plan.
- Checkout Web Sandbox de Wompi con firma de integridad.
- Activación únicamente por webhook `transaction.updated` firmado.
- Estados de pago y suscripción definidos por Payments v1.
- Trial y piloto aprobados por Super Admin, con actor, motivo y fecha.
- Bypass de piloto para RAV Toys sin bloquear la creación del bot.
- Facturación en Super Admin con contrato, cobros, comisión, neto, fechas e historial.
- `Mi plan` en Customer Panel con la misma fuente de datos y aislamiento por tenant.
- Comisión `Real` cuando Wompi la entrega; en otro caso `Estimada`.
- Idempotencia por proveedor, transacción y estado.
- Rechazo de montos distintos al checkout y de regresiones tardías de pagado a fallido.
- Feature gate `PAYMENTS_V1_ENABLED`, apagado por defecto.

## Flujo de seguridad

1. La aplicación obtiene bot, plan y precios del catálogo central.
2. Guarda una copia contractual de los precios en COP enteros.
3. Crea una referencia única y firma `reference + amount_in_cents + COP + integrity_secret`.
4. Envía al navegador únicamente la llave pública Sandbox y la firma de integridad.
5. El retorno del navegador deja el pago pendiente.
6. El webhook valida ambiente `test`, propiedades dinámicas, timestamp y secreto de eventos.
7. Solo un webhook `APPROVED` marca `paid`, `active` y `ready_for_bot_creation`.

No se guardan datos de tarjeta.

## Base de datos

Migración aplicada al Supabase de Staging:

- `billing_contracts`
- `payment_transactions`
- `payment_webhook_events`
- `billing_audit_log`

Las cuatro tablas tienen RLS forzado, permisos revocados a `public`, `anon` y
`authenticated`, y acceso por funciones `security definer` limitado a `service_role`.

Archivos:

- `docs/migrations/20260725_payments_v1_up.sql`
- `docs/migrations/20260725_payments_v1_down.sql`

La migración de subida fue ejecutada y verificada en Staging. El feature gate quedó
apagado mientras se completan las credenciales Sandbox.

## Configuración requerida en Render Staging

```text
PAYMENTS_V1_ENABLED=1
PAYMENTS_ENV=staging
WOMPI_PUBLIC_KEY=pub_test_...
WOMPI_INTEGRITY_SECRET=test_integrity_...
WOMPI_EVENT_SECRET=test_events_...
WOMPI_ESTIMATED_FEE_RATE=<decimal contractual>
WOMPI_ESTIMATED_FIXED_FEE=<COP contractual>
WOMPI_ESTIMATED_FEE_TAX_RATE=<decimal contractual>
```

`PUBLIC_BASE_URL` y `CUSTOMER_PANEL_BASE_URL` deben continuar en
`https://staging.nextforia.com`.

Las llaves se configuran directamente en Render. No se guardan en GitHub, archivos
locales, logs ni documentación.

## Webhook Sandbox

```text
https://staging.nextforia.com/webhooks/wompi
```

El endpoint acepta solo eventos de ambiente `test` con firma válida. Una entrega
repetida responde correctamente sin duplicar el historial.

## Comisión estimada

Cuando el evento no contiene una comisión real, la estimación usa:

```text
base = amount * rate + fixed_fee
provider_fee = base * (1 + tax_rate)
net_amount = amount - provider_fee
```

Los tres componentes deben corresponder al contrato real de la cuenta Wompi de
RAV Kids SAS. No se deben inferir desde Producción.

## Activación y rollback

Activación:

1. Confirmar las tres credenciales Sandbox y la tarifa contractual.
2. Configurar el webhook Sandbox.
3. Añadir las variables solo en Render Staging.
4. Desplegar `v123-staging-payments-v1`.
5. Ejecutar pago exitoso, fallido, repetido, trial, piloto y aislamiento A/B.
6. Activar el feature gate solo después de esas verificaciones.

Rollback inmediato:

1. Cambiar `PAYMENTS_V1_ENABLED=0` en Render Staging y desplegar.
2. Mantener los datos para auditoría mientras se investiga.
3. Si se requiere rollback de esquema, tomar respaldo y aplicar la migración de
   bajada únicamente en Supabase Staging.
