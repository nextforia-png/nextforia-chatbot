# WhatsApp v2/v368: runbook ejecutable de Producción en Render Free

Este procedimiento publica el onboarding autoservicio de WhatsApp incluido en
`v368-whatsapp-coexistence`. El release autorizado es:

```text
CODE_SHA: 19fdaf9b22af7a0b4fac8a0adf26f63eaa388e84
BOT_VERSION: v368-whatsapp-coexistence
```

`CODE_SHA` identifica el código ejecutable aprobado y no cambia cuando este
runbook se agrega después en un commit exclusivamente documental. Registrar ese
commit aparte como `RUNBOOK_COMMIT_SHA`; no tratarlo como un nuevo release ni
permitir que su merge dispare un despliegue. No sustituir `CODE_SHA` por
“latest”, por el SHA de merge o por el commit documental. No abrir Producción
solo porque Meta acepte el webhook o porque `/admin/health` responda HTTP 200.
La apertura requiere el E2E completo de la sección **Validación E2E**.

## Responsables y variables del runbook

Antes de empezar, registrar en el ticket de cambio:

```text
CODE_SHA=19fdaf9b22af7a0b4fac8a0adf26f63eaa388e84
RUNBOOK_COMMIT_SHA=<commit que solo agrega/corrige este documento>
PREVIOUS_DEPLOY_ID=<deployment actualmente sano>
PREVIOUS_SHA=<SHA actualmente sano>
SUPABASE_BACKUP_ID=<backup/PITR confirmado>
PRODUCTION_SERVICE=<servicio Render de api.nextforia.com>
PRODUCTION_SERVICE_ID=srv-d7kkqqbeo5us73de2500
PRODUCTION_PLAN=Free
REQUIRED_CUTOVER_MODE=free_connector_mutation_gate
E2E_TENANT_ID=<tenant externo de prueba>
E2E_PHONE_NUMBER_ID=<se completa después de Embedded Signup>
E2E_WABA_ID=<se completa después de Embedded Signup>
E2E_MARKER=WA-PROD-<UTC-YYYYMMDD-HHMMSS>
E2E_STARTED_AT=<timestamp UTC anterior al envío>
E2E_ENDED_AT=<timestamp UTC posterior a la respuesta>
INBOUND_WAMID=<ID wamid del mensaje E2E recibido por el webhook firmado>
OUTBOUND_WAMID_SUFFIX=<sufijo capturado inmediatamente en /whatsapp/health>
```

Roles mínimos:

- un operador de Render que pueda cambiar variables, desplegar un SHA exacto y
  revisar logs;
- un operador de Supabase que pueda aplicar migraciones y consultar el esquema;
- un administrador del tenant E2E y una empresa de Meta externa;
- para Cloud API exclusiva, un número nuevo que no esté activo en WhatsApp ni
  WhatsApp Business App; o, para coexistencia, un número activo y elegible en
  WhatsApp Business App con el teléfono disponible para confirmar el flujo;
- un método de pago válido en WhatsApp Manager para demostrar una respuesta
  saliente real fuera de cualquier ventana gratuita aplicable.

El estado conocido de Producción es el servicio
`srv-d7kkqqbeo5us73de2500`, plan **Free**, una sola instancia y Auto-Deploy
**Off**. v368 conserva `CHANNEL_CONNECTIONS_MUTATIONS_ENABLED`: al ponerlo en
`0`, todos los connect/select/verify/disconnect y callbacks OAuth quedan
cerrados, mientras los webhooks y runtimes ya conectados permanecen activos.
Esta es la barrera gratuita usada durante los tres reemplazos de instancia.

No se usa Upgrade, Maintenance Mode, Suspend ni Resume. Cada cambio de variables
se aplica con **Save and deploy** y solo se continúa cuando el deployment nuevo
está `live`, el anterior terminó y el health/log cumplen el gate de la fase.

Referencias de la plataforma: [Maintenance Mode](https://render.com/docs/maintenance-mode),
[variables y Save only](https://render.com/docs/configure-environment-variables)
y [secuencia de deploy/restart](https://render.com/docs/deploys).

## Invariantes que no se pueden romper

1. `tenant_channel_connections` es la única autoridad de routing. Credenciales,
   aliases o tenants ambientales no asignan propietarios.
2. Un `phone_number_id` o WABA activo/no terminal pertenece a un solo tenant.
3. `whatsapp_registration_claims` se escribe antes del único intento de
   `POST /{phone_number_id}/register`. Meta no ofrece idempotency key: si el
   proceso cae después del envío, v368 reconcilia, pero no repite `/register`
   durante 72 horas.
4. Un webhook firmado se confirma con HTTP 200 solo después de persistir todos
   sus mensajes/estados en `meta_webhook_events`.
5. `conversation_logs (tenant_id, channel, source_event_id)` evita duplicar el
   turno al reintentar una entrega.
6. El kill switch cierra altas nuevas, pero no apaga el store durable ni borra
   conexiones, claims, inbox o conversaciones.

## 0. Gate previo antes de tocar Producción

El camino normal exige E2E real de Staging. Si el propietario autoriza
explícitamente usar Producción como entorno de aceptación, puede omitirse solo
ese E2E previo, pero no los gates de código ni el E2E final. Deben existir:

- Staging ejecutando el mismo árbol de código con health sano;
- CI completa, aislamiento de tenants y security scan en verde;
- configuración Embedded Signup v4 verificada en Meta;
- un tenant de prueba aislado y un número completamente nuevo reservados para
  la sección 9;
- Auto-Deploy de Producción apagado y cero WhatsApp activo/pending.

La publicación no se declara terminada al quedar el proceso `live`: permanece
en verificación hasta demostrar en Producción el inbound, Customer Panel,
respuesta y receipt `delivered`/`read` de la sección 9.

## 1. Validar el artefacto exacto antes de tocar Producción

Antes de hacer merge o de cambiar variables, abrir **Render > servicio de
Producción > Settings** y confirmar que Auto-Deploy para `main` continúa **Off**
(ese es el estado conocido). Confirmar que no haya un deploy automático
queued/building/in progress y registrar una captura en el ticket. Si Auto-Deploy
está activo y no puede desactivarse, detener el cambio.
Este gate evita que el merge commit o el posterior commit documental salten el
`CODE_SHA` aprobado. Los despliegues de este runbook son manuales por SHA exacto;
Auto-Deploy permanece desactivado hasta terminar el E2E y decidir explícitamente
qué commit de `main` queda autorizado para el siguiente release.

En un checkout limpio del release:

```bash
git fetch origin
git checkout --detach b7b9bd3bc181e7e6874beff5326057b1c7679eaa
test "$(git rev-parse HEAD)" = "b7b9bd3bc181e7e6874beff5326057b1c7679eaa"
git status --short
pnpm install --frozen-lockfile
pnpm test
pnpm test:channels
pnpm test:tenant-isolation
pnpm security:scan
node --check index.js
node --check channel-connections.js
node --check meta-webhook-inbox.js
node --check whatsapp-delivery-checkpoint.js
git diff --check
```

Gate: Auto-Deploy de Producción está desactivado, no hay deploy pendiente, todos
los comandos terminan en cero y `git status --short` no muestra cambios.
Adjuntar la salida de CI y la revisión con 0 P0/0 P1 al ticket. Si ya existe
`RUNBOOK_COMMIT_SHA`, verificar por separado que su diff contra `CODE_SHA` solo
contenga documentación; el target manual de código continúa siendo `CODE_SHA`.

## 2. Preflight de Meta y secretos

Verificar por presencia/valor en Render, sin imprimir secretos:

```text
NODE_ENV=production
PUBLIC_BASE_URL=https://api.nextforia.com
CUSTOMER_PANEL_BASE_URL=https://nextforia.com
SUPABASE_URL=<proyecto de Producción, no Staging>
SUPABASE_KEY=<service_role del mismo proyecto>
DATA_ENCRYPTION_KEY=<base64url de 32 bytes; conservar la clave vigente>
META_APP_ID=1506359908170226
META_APP_SECRET=<secreto de la misma app>
META_WHATSAPP_CONFIG_ID=1701806697766620
META_WHATSAPP_COEXISTENCE_CONFIG_ID=<configuración v4 con coexistencia; puede ser la misma si Meta la habilitó>
META_GRAPH_VERSION=v26.0
VERIFY_TOKEN=<token que ya valida https://api.nextforia.com/webhook>
ALLOW_UNSIGNED_WEBHOOKS=0 (o ausente)
```

No rotar `DATA_ENCRYPTION_KEY` durante este cambio: hacerlo volvería ilegibles
las credenciales y payloads ya cifrados. Confirmar además en Meta:

- configuración `1701806697766620`, producto **WhatsApp Cloud API** y Embedded
  Signup v4;
- permisos exactos `whatsapp_business_management` y
  `whatsapp_business_messaging` con Advanced Access;
- callback `https://api.nextforia.com/webhook`, objeto **WhatsApp Business
  Account**, campos `messages` y `account_update`;
- dominio `https://nextforia.com` y callback
  `https://nextforia.com/admin/channel-connections/meta/callback` autorizados.

Inventariar por nombre y presencia —sin imprimir valores— estas pistas antiguas.
No retirarlas todavía: su eliminación se hace con el gate de mutaciones cerrado
en la sección 7, después de probar el owner tenant-scoped cifrado. v368 las ignora y emite
`environment_channel_ownership_hints_ignored`, pero no deben quedar como un
respaldo aparente:

```text
WA_TOKEN
PHONE_NUMBER_ID
META_WHATSAPP_BUSINESS_ACCOUNT_ID / WHATSAPP_BUSINESS_ACCOUNT_ID
CHANNEL_CONNECTION_BOOTSTRAP_WHATSAPP_TENANT_ID
CHANNEL_CONNECTION_INTERNAL_TENANT_ALIASES
cualquier variable cuyo nombre termine en _WHATSAPP_REGISTER_NOW o
_WHATSAPP_REGISTER_ON_BOOT y tenga valor 1
```

Si se desconoce qué tenant/phone/WABA corresponde a una pista, registrarla como
no migrada y detener el retiro; no adoptar, transferir ni desconectar el activo
automáticamente durante este release.

## 3. Congelar mutaciones en la instancia Free

1. Guardar `PREVIOUS_DEPLOY_ID`, `PREVIOUS_SHA`, el conteo de instancias y una
   captura que muestre solo nombres/presencia de variables con todos los valores
   enmascarados.
2. Antes de elegir el camino, confirmar que no exista WhatsApp activo o en
   proceso:

   ```sql
   select tenant_id, status, right(coalesce(phone_number_id, ''), 8) as phone_suffix
   from public.tenant_channel_connections
   where channel = 'whatsapp'
     and status in ('connecting', 'connected', 'needs_attention');
   ```

   Si `meta_webhook_events` ya existe, confirmar también:

   ```sql
   select status, count(*)
   from public.meta_webhook_events
   where status in ('pending', 'processing')
   group by status;
   ```

   Cualquier conexión, intento no terminal o evento `pending`/`processing`
   obliga a detener el procedimiento y resolverlo antes del corte; no borrar ni
   reasignar filas para hacer pasar el gate.
3. Confirmar que el servicio sigue con una sola instancia Free y Auto-Deploy
   Off. Agregar únicamente el gate operativo y desplegar v368:

   ```text
   CHANNEL_CONNECTIONS_MUTATIONS_ENABLED=0
   ```

   No crear todavía `CHANNEL_CONNECTIONS_V1_ENABLED`; conservar su estado
   ausente/false. Mantener `CHANNEL_CONNECTIONS_DEDICATED_STORE_ENABLED`
   ausente/false. Esperar que el deployment nuevo esté `live` y que el anterior
   haya terminado.
4. Confirmar desde Internet que `/admin/health` sigue `running`, que el bot es
   v368 y que `customer_setup.meta_oauth_ready=false`. Los webhooks no deben
   responder 503: los canales existentes continúan activos; únicamente las
   mutaciones devuelven `channel_connections_maintenance`/Retry-After.
5. Confirmar en Deploys/Logs que no queda el deployment anterior.
6. Esperar que no existan trabajos `processing` dos veces, con 30 s entre
   consultas. No borrar filas `pending` o `dead_letter`:

   ```sql
   select status, count(*)
   from public.meta_webhook_events
   group by status
   order by status;

   select count(*) as processing_now
   from public.meta_webhook_events
   where status = 'processing';
   ```

   Si la tabla aún no existe, esta comprobación se repite después de migrar.

Gate: bot v368 `live`, mutaciones cerradas, runtimes/webhooks existentes sanos,
ninguna instancia antigua recibiendo solicitudes y cero eventos `processing`.

## 4. Backup y preflight de ownership

Crear un backup restaurable/PITR de Supabase Producción y registrar su ID. El
backup es para desastre, no para un rollback normal que elimine claims o inbox
posteriores al corte.

Ejecutar estas consultas antes de la migración v2:

```sql
select to_regclass('public.tenants') as tenants,
       to_regclass('public.conversation_logs') as conversation_logs,
       to_regclass('public.tenant_channel_connections') as connections,
       to_regclass('public.tenant_channel_connection_audit') as connection_audit;

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'conversation_logs'
  and column_name in ('tenant_id', 'channel')
order by column_name;

select phone_number_id,
       count(distinct tenant_id) as owner_count,
       array_agg(distinct tenant_id order by tenant_id) as tenants
from public.tenant_channel_connections
where channel = 'whatsapp'
  and phone_number_id is not null
  and status in ('connecting', 'connected', 'needs_attention')
group by phone_number_id
having count(distinct tenant_id) > 1;

select whatsapp_business_account_id,
       count(distinct tenant_id) as owner_count,
       array_agg(distinct tenant_id order by tenant_id) as tenants
from public.tenant_channel_connections
where channel = 'whatsapp'
  and whatsapp_business_account_id is not null
  and status in ('connecting', 'connected', 'needs_attention')
group by whatsapp_business_account_id
having count(distinct tenant_id) > 1;

select tenant_id, status, right(coalesce(phone_number_id, ''), 8) as phone_suffix,
       right(coalesce(whatsapp_business_account_id, ''), 8) as waba_suffix
from public.tenant_channel_connections
where channel = 'whatsapp'
  and status in ('connecting', 'connected', 'needs_attention')
  and tenant_id ~ '^meta-app-review-[a-z0-9-]+$';
```

Gates:

- las cuatro relaciones existen; si `tenant_channel_connections` no existe,
  aplicar primero `docs/migrations/20260726_channel_connections_v1_up.sql`;
- `conversation_logs` devuelve exactamente `channel` y `tenant_id`;
- las dos consultas de propietarios duplicados devuelven cero filas;
- no hay owner temporal activo. Cualquier resultado requiere decisión explícita
  de Super Admin; no elegir el owner más reciente ni reasignar un tenant.

## 5. Aplicar y verificar migraciones

Con `CHANNEL_CONNECTIONS_MUTATIONS_ENABLED=0` y v368 confirmado `live`, aplicar
en Supabase Producción:

1. `docs/migrations/20260726_channel_connections_v1_up.sql`, solamente si la
   tabla v1 no existía;
2. `docs/migrations/20260808_whatsapp_onboarding_v2_up.sql`.

Ambas migraciones son transaccionales e idempotentes. Si un índice único falla,
la transacción v2 revierte: resolver el conflicto de ownership por un proceso
separado y volver a ejecutar; no borrar la fila que “estorba”.

Verificar sin consultar ciphertext ni credenciales:

```sql
select to_regclass('public.tenant_channel_connections') as connections,
       to_regclass('public.whatsapp_registration_claims') as registration_ledger,
       to_regclass('public.meta_webhook_events') as webhook_inbox;

select exists (
  select 1 from information_schema.columns
  where table_schema = 'public'
    and table_name = 'tenant_channel_connections'
    and column_name = 'whatsapp_outbound_billing_status_at'
) as billing_watermark_ready,
exists (
  select 1 from information_schema.columns
  where table_schema = 'public'
    and table_name = 'conversation_logs'
    and column_name = 'source_event_id'
) as source_event_id_ready,
exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'begin_whatsapp_attempt_v2'
) as begin_rpc_ready,
exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'claim_whatsapp_registration_v2'
) as register_claim_rpc_ready,
exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'claim_whatsapp_reconciliation_v2'
) as reconciliation_rpc_ready,
exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'claim_meta_webhook_event_v1'
) as inbox_claim_rpc_ready,
exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'meta_webhook_inbox_ready_v1'
) as inbox_ready_rpc_ready;

select has_table_privilege('service_role',
         'public.whatsapp_registration_claims', 'SELECT') as ledger_service_read,
       has_table_privilege('service_role',
         'public.meta_webhook_events', 'SELECT') as inbox_service_read,
       has_table_privilege('service_role',
         'public.meta_webhook_events', 'INSERT') as inbox_service_insert,
       has_table_privilege('service_role',
         'public.meta_webhook_events', 'UPDATE') as inbox_service_update;
```

Todas las relaciones deben existir y todos los booleanos deben ser `true`.
No ejecutar `select public.meta_webhook_inbox_ready_v1()` desde SQL Editor: la
función falla correctamente con `SERVICE_ROLE_REQUIRED` fuera de una solicitud
autenticada como `service_role`. El preflight runtime de v368 es quien prueba esa
RPC con el rol correcto.

Repetir las consultas de ownership incorporando intentos v2; ambas deben dar
cero filas:

```sql
with claims as (
  select tenant_id,
         coalesce(onboarding_attempt_phone_number_id, phone_number_id) as asset_id
  from public.tenant_channel_connections
  where channel = 'whatsapp'
    and coalesce(onboarding_attempt_phone_number_id, phone_number_id) is not null
    and (
      status in ('connecting', 'connected', 'needs_attention')
      or coalesce(onboarding_attempt_status, '') not in ('', 'completed', 'cancelled')
    )
)
select asset_id, count(distinct tenant_id) as owner_count,
       array_agg(distinct tenant_id order by tenant_id) as tenants
from claims
group by asset_id
having count(distinct tenant_id) > 1;

with claims as (
  select tenant_id,
         coalesce(onboarding_attempt_waba_id, whatsapp_business_account_id) as asset_id
  from public.tenant_channel_connections
  where channel = 'whatsapp'
    and coalesce(onboarding_attempt_waba_id, whatsapp_business_account_id) is not null
    and (
      status in ('connecting', 'connected', 'needs_attention')
      or coalesce(onboarding_attempt_status, '') not in ('', 'completed', 'cancelled')
    )
)
select asset_id, count(distinct tenant_id) as owner_count,
       array_agg(distinct tenant_id order by tenant_id) as tenants
from claims
group by asset_id
having count(distinct tenant_id) > 1;
```

## 6. Verificar v368 con las mutaciones cerradas

Conservar `CHANNEL_CONNECTIONS_MUTATIONS_ENABLED=0` y desplegar manualmente el
`CODE_SHA` exacto `19fdaf9b22af7a0b4fac8a0adf26f63eaa388e84`.
No crear todavía `CHANNEL_CONNECTIONS_V1_ENABLED` ni encender el store dedicado.

Esperar a que **todas** las instancias terminen el reemplazo. En cada instancia
deben aparecer:

```text
NextforIA Chatbot v368-whatsapp-coexistence ... running on port ...
Meta channel delivery: encrypted tenant connections only
```

No deben aparecer `Secure configuration failed` ni un crash loop. Consultar
desde Internet porque la instancia Free no ofrece Render Shell:

```bash
curl -fsS "https://api.nextforia.com/admin/health"
```

Gate provisional:

```text
bot.version == v368-whatsapp-coexistence
status == running
customer_setup.meta_oauth_ready == false (esperado con mutaciones cerradas)
```

`customer_setup.channel_storage_ready` todavía puede reflejar el store legacy.
`meta_oauth_ready=false` confirma que la superficie pública de conexión está
cerrada. No abrir las mutaciones todavía.

## 7. Encender el store durable y ejecutar el cutover histórico

Cambiar solo:

```text
CHANNEL_CONNECTIONS_DEDICATED_STORE_ENABLED=1
CHANNEL_CONNECTIONS_MUTATIONS_ENABLED=0
```

Desplegar de nuevo el mismo SHA exacto y esperar el reemplazo completo de todas
las instancias. El arranque hace un scan estricto del estado append-only,
compara ownership, backfillea filas más nuevas y luego vuelve al store primario
la única autoridad. El alta sigue cerrada durante todo el proceso.

Gates de logs:

- `startup_protection_diagnostic` tiene `mode=read_only` y no informa
  `asset_has_multiple_tenant_owners` ni `temporary_review_owner_active`;
- no aparece `whatsapp_store_cutover_blocked`;
- no aparece `meta_webhook_inbox_readiness_failed`;
- no aparece `meta_webhook_inbox_unavailable`,
  `meta_webhook_inbox_enqueue_failed` ni `meta_webhook_inbox_drain_failed`;
- una pista ambiental inesperada produce
  `environment_channel_ownership_hints_ignored`: retirarla y redesplegar antes
  de continuar, sin adoptar ni reasignar el activo.

Consultar nuevamente desde Internet:

```bash
curl -fsS "https://api.nextforia.com/admin/health"
```

Gate obligatorio:

```text
bot.version == v368-whatsapp-coexistence
customer_setup.channel_storage_ready == true
customer_setup.meta_oauth_ready == false
status == running
```

Este `channel_storage_ready=true` prueba con `service_role` la RPC de readiness
del inbox, el cutover y que el runtime tiene disponibles los adaptadores
atómicos. No ejecuta una mutación real de begin/claim/disconnect ni demuestra
por sí solo INSERT/UPDATE del inbox; esas operaciones quedan cubiertas por CI y
por el E2E real de la sección 9. Un simple HTTP 200 no basta.

Con las mutaciones aún cerradas, validar cada pista ambiental inventariada en la
sección 2 contra su owner exacto sin seleccionar el ciphertext:

```sql
select tenant_id,
       status,
       phone_number_id = '<LEGACY_PHONE_NUMBER_ID>' as phone_matches,
       whatsapp_business_account_id = '<LEGACY_WABA_ID>' as waba_matches,
       credentials_ciphertext like 'enc:v1:%' as credential_encrypted
from public.tenant_channel_connections
where tenant_id = '<LEGACY_TENANT_ID>'
  and channel = 'whatsapp';
```

Debe existir exactamente una fila y todos los booleanos deben ser `true`; el
estado debe corresponder al estado real del activo en Meta. Solo entonces retirar
la pista correspondiente del ambiente usando **Save and deploy**, siempre con
las mutaciones cerradas, y repetir los gates de health/logs. Si falta la fila,
no coincide el owner o no está cifrada, conservar la variable, mantener el alta
cerrada y detener el release para una migración explícita.

Esperar además `processing_now=0` dos veces con 30 s de separación antes del
siguiente deploy. Las filas `pending` se conservan para reintento; investigar
cualquier `dead_letter` y no borrarla.

## 8. Abrir el alta pública sin exponer fleet incompatible

Antes de abrir, la instancia debe ejecutar v368 con el store dedicado en `1` y
las mutaciones siguen cerradas. Cambiar:

```text
CHANNEL_CONNECTIONS_V1_ENABLED=1
CHANNEL_CONNECTIONS_DEDICATED_STORE_ENABLED=1
CHANNEL_CONNECTIONS_MUTATIONS_ENABLED=1
```

Desplegar otra vez el mismo SHA. Esperar el reemplazo de **todas** las
instancias. Repetir los gates de versión/status/logs de la sección 6 y el gate
de readiness de la sección 7; no repetir el valor `meta_oauth_ready=false`, que
es específico de la fase cerrada `0/0`. En la respuesta autenticada de
`/admin/health`, usar una sesión legítima de Super Admin; no usar
`DASHBOARD_KEY` ni credenciales ambientales como respaldo. Verificar además:

```text
channel_connections.enabled_flag == true
channel_connections.storage == supabase_dedicated_with_append_only_fallback
channel_connections.atomic_whatsapp_onboarding == true
channel_connections.meta_authorization_available.whatsapp == true
```

El nombre del storage conserva “fallback” por la clase de migración, pero,
después del cutover exitoso, `primaryAuthoritative=true`: routing y escrituras
usan la tabla dedicada; no vuelven a inferir ownership del ambiente.

Verificar desde Internet:

```bash
curl -fsS https://api.nextforia.com/admin/health
```

Debe mostrar v368, `channel_storage_ready=true`, `meta_oauth_ready=true` y
`status=running`. Antes de conectar un número, `/whatsapp/health` puede responder
503 con `status=not_configured`; eso es esperado y no demuestra un fallo del
store. Tampoco es evidencia de E2E.

## 9. Validación E2E obligatoria

Producción requiere una empresa Meta externa y un tenant aislado. La ruta
Cloud API exclusiva requiere **un segundo número completamente nuevo, distinto
del número usado en Staging**. La ruta de coexistencia requiere un número activo
en WhatsApp Business App y elegible por Meta; esta ruta no ejecuta `/register` y
no debe desinstalar ni desconectar la aplicación móvil.

1. Iniciar sesión como admin del `E2E_TENANT_ID` en el Customer Panel.
2. Elegir una sola ruta:
   - **Conectar número nuevo** para Cloud API exclusiva; o
   - **Conservar mi WhatsApp Business** para coexistencia.
3. Completar login/OTP/seguridad y selección del número dentro de Embedded
   Signup. En coexistencia, confirmar el teléfono o QR solicitado por Meta y
   comprobar que WhatsApp Business App siga operativa. No introducir un PIN
   manual en Nextfor ni abrir WhatsApp Manager para completar el alta.
4. Esperar que el panel muestre `connected`. No pulsar repetidamente conectar,
   activar o verificar.
5. Registrar `attempt_id`, `phone_number_id` y WABA sin copiar tokens.
6. En coexistencia, demostrar en logs/telemetría que no hubo `POST /register` y
   que un mensaje enviado manualmente desde WhatsApp Business App llegó al
   Customer Panel como respuesta humana sin activar otra respuesta del bot.

Evidencia de conexión y del único claim:

```sql
select tenant_id, status, webhook_status,
       right(phone_number_id, 8) as phone_suffix,
       right(whatsapp_business_account_id, 8) as waba_suffix,
       onboarding_attempt_id, onboarding_attempt_status,
       onboarding_attempt_registration_requested_at,
       onboarding_attempt_registration_accepted_at,
       onboarding_attempt_subscription_confirmed_at
from public.tenant_channel_connections
where tenant_id = '<E2E_TENANT_ID>' and channel = 'whatsapp';

select attempt_id, tenant_id,
       right(phone_number_id, 8) as phone_suffix,
       right(waba_id, 8) as waba_suffix,
       requested_at
from public.whatsapp_registration_claims
where phone_number_id = '<E2E_PHONE_NUMBER_ID>'
order by requested_at;

select count(*) as other_tenant_owners
from public.tenant_channel_connections
where channel = 'whatsapp'
  and tenant_id <> '<E2E_TENANT_ID>'
  and (
    coalesce(onboarding_attempt_phone_number_id, phone_number_id) = '<E2E_PHONE_NUMBER_ID>'
    or coalesce(onboarding_attempt_waba_id, whatsapp_business_account_id) = '<E2E_WABA_ID>'
  )
  and (
    status in ('connecting', 'connected', 'needs_attention')
    or coalesce(onboarding_attempt_status, '') not in ('', 'completed', 'cancelled')
  );
```

Gates: fila `connected`, WABA/phone/tenant correctos, intento terminado, un solo
claim para ese teléfono/intento y `other_tenant_owners=0`.

6. Desde otro teléfono enviar el texto exacto `E2E_MARKER` al número de
   Producción. Después de verlo una sola vez en el Customer Panel, fijar
   `E2E_ENDED_AT` y descubrir el `INBOUND_WAMID` sin leer contenido cifrado:

   ```sql
   select source_event_id, ts
   from public.conversation_logs
   where tenant_id = '<E2E_TENANT_ID>'
     and channel = 'whatsapp'
     and ts between '<E2E_STARTED_AT>' and '<E2E_ENDED_AT>'
   order by ts, id;
   ```

   La consulta debe devolver exactamente una fila, correspondiente al único
   marcador corroborado visualmente. Registrar su `source_event_id` como
   `INBOUND_WAMID`; es metadata del mensaje, no su contenido. Si devuelve cero o
   más de una fila, aislar una nueva ventana y repetir con un marcador distinto;
   no adivinar el ID.
7. Confirmar que el mensaje aparece una sola vez, bajo la empresa correcta, en
   el Customer Panel.
8. Esperar una sola respuesta del bot y confirmar que llega al WhatsApp emisor.
9. Capturar inmediatamente
   `/whatsapp/health.runtime.last_outbound_message_id_suffix` como
   `OUTBOUND_WAMID_SUFFIX`.
10. Esperar el status webhook `sent` y luego `delivered` (o `read`).

Usar el `INBOUND_WAMID` conocido como `source_event_id`. No buscar el marcador
en `conversation_logs`: `user_message` y `bot_reply` están cifrados. El texto
exacto y la respuesta se comprueban visualmente en el Customer Panel autenticado.

```sql
select tenant_id, channel, source_event_id, status, ts,
       user_message like 'enc:v1:%' as inbound_ciphertext_valid,
       bot_reply like 'enc:v1:%' as outbound_ciphertext_valid
from public.conversation_logs
where tenant_id = '<E2E_TENANT_ID>'
  and channel = 'whatsapp'
  and source_event_id = '<INBOUND_WAMID>';

select tenant_id, channel, source_event_id, count(*)
from public.conversation_logs
where channel = 'whatsapp'
  and source_event_id = '<INBOUND_WAMID>'
group by tenant_id, channel, source_event_id;

select event_id, destination_id, status, attempts,
       payload_ciphertext is null as payload_cleared_after_processing,
       received_at, processed_at, last_error
from public.meta_webhook_events
where event_id = 'whatsapp:<INBOUND_WAMID>';

select event_id, status, attempts, received_at, processed_at, last_error
from public.meta_webhook_events
where event_id like 'whatsapp:status:%'
  and tenant_id = '<E2E_TENANT_ID>'
  and destination_id = '<E2E_PHONE_NUMBER_ID>'
  and received_at >= '<E2E_STARTED_AT>'
order by received_at;
```

No seleccionar ni previsualizar el valor de `user_message`, `bot_reply`,
`payload_ciphertext` o `credentials_ciphertext`; las expresiones booleanas
anteriores prueban el prefijo `enc:v1:%` de la conversación y que el inbox
eliminó su payload después de procesarlo. La consulta de status prueba
persistencia/ejecución para el tenant, teléfono y ventana, pero el inbox guarda
un hash y no permite correlacionar por SQL el WAMID saliente. La prueba exacta
es un log `whatsapp_delivery_status` con `tenant_id=<E2E_TENANT_ID>`,
`message_id_suffix=<OUTBOUND_WAMID_SUFFIX>` y `status=delivered` o `read`, sin un
`failed` posterior para ese mismo sufijo.

Gates finales:

- inbox del mensaje y de sus status en `completed`;
- exactamente un turno para `(tenant_id, whatsapp, source_event_id)`;
- `inbound_ciphertext_valid`, `outbound_ciphertext_valid` y
  `payload_cleared_after_processing` son `true`;
- cero filas con ese `source_event_id` en otro tenant;
- mensaje visible una sola vez en el Customer Panel correcto;
- respuesta real recibida y Meta confirma `delivered`/`read`;
- no hay `outbound_pending`, `dead_letter`, asset ambiguo ni errores de firma;
- la misma conversación no aparece al abrir un segundo tenant de control.

Si Meta devuelve `131042`, el bot de entrada puede recibir, pero la salida queda
bloqueada. El gate falla: agregar un método de pago válido, enviar un mensaje
nuevo y esperar un status `delivered`/`read` más reciente. v368 mantiene
`webhook_status=outbound_billing_blocked` hasta esa evidencia posterior; no
limpiar el campo manualmente.

## 10. Observación posterior a la apertura

Durante al menos 30 minutos, vigilar:

```text
whatsapp_store_cutover_blocked
meta_webhook_inbox_readiness_failed
meta_webhook_inbox_unavailable
meta_webhook_inbox_enqueue_failed
meta_webhook_inbox_drain_failed
meta_webhook_lease_lost
whatsapp_destination_rejected
ambiguous_destination_owner
whatsapp_reconciler_scan_failed
whatsapp_delivery_status (failed / 131042)
```

Repetir conteos de `meta_webhook_events` y ownership. `processing` puede existir
transitoriamente; no debe quedar con lease vencido sin ser reclamado. Los fallos
recuperables permanecen `pending` hasta 72 horas y hasta 160 intentos, con
backoff máximo de 30 minutos. No borrarlos para “poner el health verde”.

## Kill switch: detener nuevas conexiones y conservar mensajería existente

Este es el rollback preferido ante cualquier anomalía de onboarding:

1. Cambiar únicamente:

   ```text
   CHANNEL_CONNECTIONS_MUTATIONS_ENABLED=0
   CHANNEL_CONNECTIONS_DEDICATED_STORE_ENABLED=1
   ```

2. Redesplegar el mismo SHA v368 y esperar el reemplazo de la instancia Free.
3. Repetir los gates de store/inbox y confirmar que los webhooks existentes
   siguen respondiendo.

Resultado: el botón de alta queda cerrado; conexiones tenant-scoped existentes,
webhooks, inbox, reintentos y respuestas siguen usando el store durable. Nunca
poner `CHANNEL_CONNECTIONS_DEDICATED_STORE_ENABLED=0` mientras v368 siga
atendiendo conexiones creadas por v2.

## Rollback de aplicación

Un rollback de aplicación solo es seguro hacia un SHA que lea el mismo store
dedicado, respete `whatsapp_registration_claims`, persista el inbox antes del
HTTP 200 y entienda `outbound_pending`. Si el `PREVIOUS_SHA` no cumple esas
condiciones, no volver a él después de abrir v2: aplicar el kill switch y hacer
roll-forward.

Para un SHA compatible:

1. Aplicar primero el kill switch
   (`MUTATIONS_ENABLED=0`, `DEDICATED_STORE_ENABLED=1`) en v368.
2. Esperar que la instancia Free nueva esté `live` y la anterior haya terminado.
3. Esperar `processing_now=0` dos veces con 30 s de separación.
4. Desplegar el SHA compatible conocido manteniendo el store durable en `1` y
   las mutaciones cerradas.
5. Verificar versión, RPCs, ownership, inbox y conexión existente antes de
   decidir si se reabren las mutaciones.

Si un rollback excepcional a código pre-v2 es inevitable, mantener las
mutaciones cerradas y tratar WhatsApp como indisponible hasta desplegar de nuevo
un consumidor compatible. No volver a código que confirme webhooks sin routing tenant-scoped.
El código anterior puede no ver conexiones creadas por v2 y no debe recibir
webhooks que vaya a confirmar sin routing tenant-scoped.

### Prohibiciones de rollback de datos

- No ejecutar `docs/migrations/20260726_channel_connections_v1_down.sql`.
- No borrar ni truncar `whatsapp_registration_claims` o
  `meta_webhook_events`.
- No borrar `source_event_id`, el índice único de conversaciones, filas de
  conexión/auditoría, intentos o watermarks de billing.
- No restaurar el backup sobre Producción como rollback normal: eliminaría el
  ledger y el inbox creados después del backup. En una restauración por desastre
  se deben preservar/reproducir esas tablas antes de reabrir tráfico.
- `docs/migrations/20260808_whatsapp_onboarding_v2_down.sql` es
  intencionalmente no destructiva; no hace falta ejecutarla.
- No llamar `/register` manualmente ni borrar un claim para “reintentar”. Esperar
  72 horas o usar otro número nuevo.

Conservar ledger e inbox al menos durante toda la ventana de 72 horas. Cualquier
archivo o purga posterior requiere una migración separada, revisión de seguridad
y prueba de que no hay intentos activos, leases, pendientes ni claims recientes.

## Acta de salida

No cerrar el cambio hasta adjuntar:

```text
CODE_SHA y deployment ID:
RUNBOOK_COMMIT_SHA (documental, no release):
Auto-Deploy de main confirmado Off:
Plan Free y una sola instancia confirmados:
Flags finales (V1=1, DEDICATED=1, MUTATIONS=1):
Backup/PITR ID:
Resultado preflight ownership:
Resultado migration/RPC:
Resultado health privado y público:
Tenant / phone suffix / WABA suffix E2E (distinto de Staging):
Attempt ID y cantidad de claims:
Inbound source_event_id e inbox completed:
Customer Panel visible (sí/no):
Respuesta recibida (sí/no):
Status Meta delivered/read y timestamp:
Prueba negativa de otro tenant:
Errores/logs revisados:
Operador y hora UTC de luz verde:
```

Sin todos esos campos y sin el mensaje real entregado, Producción permanece
**no aprobada**, aunque la URL de webhook, el OAuth o el health sean verdes.
