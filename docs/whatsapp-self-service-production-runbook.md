# WhatsApp autoservicio: despliegue a Producción

Este runbook publica el flujo de un solo botón del Customer Panel sin tocar
propietarios, credenciales ni conexiones de otros tenants. La luz verde exige
un E2E externo en Staging y otro en Producción; un health verde por sí solo no
demuestra que el canal funcione.

## Resultado que debe probarse

1. Un administrador de un tenant nuevo pulsa **Conectar WhatsApp** una vez.
2. Meta autoriza una empresa externa y un número nuevo, sin PIN manual.
3. Nextfor ejecuta como máximo un `POST /{phone_number_id}/register`.
4. La conexión queda asociada únicamente al tenant que inició el intento.
5. Un mensaje real entra, queda en el inbox durable, aparece en el Customer
   Panel y recibe una sola respuesta.
6. Meta confirma el envío o entrega de esa respuesta.

## Configuración Meta obligatoria

- App `Nextfor Chatbot` activa y Tech Provider verificado.
- Facebook Login for Business Configuration de tipo Embedded Signup, producto
  **WhatsApp Cloud API** y token de usuario del sistema.
- Solo estos permisos con Advanced Access:
  `whatsapp_business_management` y `whatsapp_business_messaging`.
- Callback `https://api.nextforia.com/webhook` con token de verificación de
  Producción.
- Objeto **Whatsapp Business Account** suscrito al menos a `account_update` y
  `messages`.
- Dominio JavaScript y URI OAuth de `https://nextforia.com` registrados.

El nombre `RAV toys` que Meta muestra como proveedor proviene del portfolio
comercial verificado que posee la app. No renombrar ni transferir ese portfolio
dentro de este despliegue: requiere una migración empresarial separada.

## Preparación y preflight

1. Dejar en Render Producción:

   ```text
   CHANNEL_CONNECTIONS_V1_ENABLED=0
   CHANNEL_CONNECTIONS_DEDICATED_STORE_ENABLED=0
   ```

2. Desplegar el código productivo anterior y esperar que todas las instancias
   antiguas terminen. Guardar el ID del deployment y el SHA para rollback.
3. Crear un backup restaurable de Supabase y anotar su identificador.
4. Confirmar que no hay propietarios duplicados antes de crear índices únicos:

   ```sql
   select phone_number_id, array_agg(tenant_id), count(*)
   from public.tenant_channel_connections
   where channel = 'whatsapp'
     and phone_number_id is not null
     and status in ('connecting', 'connected', 'needs_attention')
   group by phone_number_id
   having count(*) > 1;

   select whatsapp_business_account_id, array_agg(tenant_id), count(*)
   from public.tenant_channel_connections
   where channel = 'whatsapp'
     and whatsapp_business_account_id is not null
     and status in ('connecting', 'connected', 'needs_attention')
   group by whatsapp_business_account_id
   having count(*) > 1;
   ```

   Ambas consultas deben devolver cero filas. Si hay un conflicto, detener el
   despliegue; no elegir un propietario automáticamente.

5. Confirmar que existe `public.conversation_logs` con `tenant_id` y `channel`.
6. Aplicar, en este orden y en la misma ventana:

   - `docs/migrations/20260726_channel_connections_v1_up.sql`, solo si la tabla
     v1 aún no existe.
   - `docs/migrations/20260808_whatsapp_onboarding_v2_up.sql`.

7. Verificar tablas y RPC sin exponer credenciales:

   ```sql
   select to_regclass('public.tenant_channel_connections'),
          to_regclass('public.whatsapp_registration_claims'),
          to_regclass('public.meta_webhook_events');

   select public.meta_webhook_inbox_ready_v1();
   ```

## Despliegue cerrado y apertura gradual

1. Desplegar el SHA nuevo con ambos flags todavía en `0`.
2. Confirmar que `/admin/health` devuelve la versión
   `v347-whatsapp-self-service`.
3. Activar únicamente:

   ```text
   CHANNEL_CONNECTIONS_DEDICATED_STORE_ENABLED=1
   ```

4. Redesplegar y esperar que todo el fleet use el SHA nuevo.
5. Comprobar:

   - `customer_setup.channel_storage_ready = true`;
   - almacenamiento atómico de WhatsApp e inbox durable disponibles;
   - ausencia de `whatsapp_store_cutover_blocked`;
   - ausencia de `meta_webhook_inbox_readiness_failed`,
     `meta_webhook_inbox_enqueue_failed` y `meta_webhook_inbox_drain_failed`.

6. Solo después activar:

   ```text
   CHANNEL_CONNECTIONS_V1_ENABLED=1
   ```

7. Ejecutar el E2E real completo con un tenant y número de prueba aislados.

## Evidencia mínima del E2E

- Una fila de conexión `connected` con tenant, WABA y phone ID correctos.
- Un único claim para el intento en `whatsapp_registration_claims`.
- Un evento firmado que recorra `meta_webhook_events` hasta `completed`.
- Un turno con el mismo `source_event_id` en `conversation_logs`.
- Mensaje visible en Customer Panel.
- Respuesta de Nextfor aceptada por Graph y estado de entrega recibido.
- Cero eventos de activo ambiguo, mezcla de tenants o reintento de `/register`.

## Rollback

El kill switch preferido es:

```text
CHANNEL_CONNECTIONS_V1_ENABLED=0
```

Esto detiene nuevas conexiones y conserva las conexiones e inbox ya creados.
Mantener `CHANNEL_CONNECTIONS_DEDICATED_STORE_ENABLED=1` mientras el código
nuevo siga desplegado.

Si también se revierte el código:

1. Apagar primero `CHANNEL_CONNECTIONS_V1_ENABLED`.
2. Apagar `CHANNEL_CONNECTIONS_DEDICATED_STORE_ENABLED`.
3. Redesplegar el SHA anterior anotado.
4. No ejecutar los archivos `down` ni borrar
   `whatsapp_registration_claims` o `meta_webhook_events`. El ledger debe
   conservarse como mínimo durante la ventana de 72 horas de Meta.

Una conexión creada después del cutover puede no ser visible para el código
anterior. Por eso el rollback de aplicación no sustituye el E2E previo ni debe
hacerse borrando datos.
