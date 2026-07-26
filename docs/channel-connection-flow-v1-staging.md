# Channel Connection Flow v1 · Staging

Fecha: 26 de julio de 2026  
Alcance: WhatsApp, Instagram y Facebook Messenger  
Feature gate: `CHANNEL_CONNECTIONS_V1_ENABLED=1`

## Estado de Staging al entregar

- Código desplegado en `https://staging.nextforia.com`.
- Versión visible: `v131-staging-channel-connections-v1`.
- El gate permanece apagado de forma segura.
- La migración de canales todavía no se aplicó.
- El servicio Staging ya tiene `DATA_ENCRYPTION_KEY`, Supabase y Customer Access v2, pero no tiene `META_APP_ID`, `META_APP_SECRET` ni `META_WHATSAPP_CONFIG_ID`.
- Por lo anterior, la UI y los flujos Meta se verificaron localmente con el modo de prueba aislado; la autorización real de los tres canales queda bloqueada hasta completar la configuración Meta.

## Guardas de alcance

- Staging únicamente. Producción requiere aprobación explícita de Santiago.
- No modifica Payments, Shopify, bot logic, preguntas del cuestionario, Financials ni Statistics.
- Telegram aparece únicamente como “Próximamente”.
- Las integraciones runtime existentes de RAV Toys siguen usando sus variables de entorno y quedan protegidas contra desconexión desde el flujo nuevo.

## Lo que ya existía y se reutiliza

- Sesión firmada v2, revalidada contra membresía activa, con `tenant_id` derivado en servidor.
- Customer Panel y Super Admin separados por rol.
- Webhooks, envío y salud existentes para WhatsApp, Instagram y Messenger.
- Validación de firma `X-Hub-Signature-256`.
- Cifrado AES-256-GCM mediante `DATA_ENCRYPTION_KEY`.
- Supabase Staging aislado y acceso exclusivo del backend con `service_role`.

## Lo construido

- Pantalla “Conecta donde tus clientes te contactan” en Customer Panel.
- Estados `not_connected`, `connecting`, `connected`, `needs_attention` y `disconnected`.
- Autorización oficial Meta sin solicitar tokens ni credenciales técnicas.
- Selección explícita cuando Meta devuelve varias páginas, cuentas profesionales o números.
- Verificación de cuenta y suscripción de webhooks.
- Reconexión y desconexión con confirmación.
- Vista Super Admin con activo conectado, verificación, último error, actor y acciones asistidas.
- Persistencia cifrada por tenant y auditoría separada.
- Rechazo seguro de eventos Instagram/Messenger que no correspondan al runtime legado de RAV mientras el bot del nuevo tenant se configura y prueba privadamente.

## Migración Staging

Aplicar:

```text
docs/migrations/20260726_channel_connections_v1_up.sql
```

Crea:

- `tenant_channel_connections`;
- `tenant_channel_connection_audit`.

Ambas tablas tienen RLS forzado, revocación para `public`, `anon` y `authenticated`, y acceso solo para `service_role`.

Rollback de datos, solo después de respaldar y apagar el gate:

```text
docs/migrations/20260726_channel_connections_v1_down.sql
```

## Configuración Meta requerida en Staging

```text
CHANNEL_CONNECTIONS_V1_ENABLED=1
META_APP_ID=<app-id-de-staging>
META_APP_SECRET=<app-secret-de-staging>
META_WHATSAPP_CONFIG_ID=<embedded-signup-configuration-id>
META_GRAPH_VERSION=v23.0
DATA_ENCRYPTION_KEY=<clave-base64url-de-32-bytes>
CUSTOMER_PANEL_BASE_URL=https://staging.nextforia.com
```

URI de redirección OAuth exacta:

```text
https://staging.nextforia.com/admin/channel-connections/meta/callback
```

Webhooks existentes:

```text
https://staging.nextforia.com/webhook
https://staging.nextforia.com/instagram/webhook
https://staging.nextforia.com/messenger/webhook
```

Permisos que deben tener Advanced Access/App Review para clientes externos:

- WhatsApp: `business_management`, `whatsapp_business_management`, `whatsapp_business_messaging`.
- Instagram: `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`, `instagram_basic`, `instagram_manage_messages`.
- Messenger: `pages_show_list`, `pages_manage_metadata`, `pages_messaging`.

WhatsApp requiere que la app esté configurada como Tech Provider/Solution Partner y que el `META_WHATSAPP_CONFIG_ID` corresponda al Embedded Signup aprobado.

## Verificación

```text
pnpm test:channels
pnpm test
pnpm security:scan
```

La matriz específica cubre:

- estados y selección de activos;
- credenciales cifradas y ausencia de secretos en respuestas;
- autorización alterada o vencida;
- conexión A/B aislada;
- body/query de otro tenant ignorado;
- acceso Super Admin separado;
- reconexión, verificación y desconexión auditadas;
- conexión heredada RAV protegida;
- Customer Panel y Super Admin sin tokens.

## Activación en Staging

1. Respaldar Supabase Staging.
2. Aplicar la migración `up`.
3. Registrar la URI OAuth exacta en la app Meta de Staging.
4. Crear o confirmar el Embedded Signup Configuration ID.
5. Confirmar App Review/Advanced Access de los permisos anteriores.
6. Añadir las variables solo al servicio Render `nextforia-staging`.
7. Activar el gate sobre `v131-staging-channel-connections-v1`, que ya está desplegada.
8. Probar un activo de prueba por canal.
9. Confirmar en Super Admin cuenta, estado, fecha, actor y ausencia de secretos.
10. Confirmar que RAV sigue visible como conexión protegida y que sus health checks no cambian.

## Antes de Producción

1. Santiago aprueba explícitamente el despliegue.
2. Crear respaldo de Producción.
3. Revisar y aprobar la migración para Producción.
4. Configurar una app/configuración Meta aprobada para Producción y su URI OAuth.
5. Confirmar Advanced Access/App Review y términos de Tech Provider.
6. Probar los tres canales con activos internos, sin clientes reales.
7. Verificar routing dinámico del bot del tenant durante la fase privada de configuración; hasta entonces los eventos de nuevos activos se rechazan de forma segura y nunca entran al runtime RAV.
8. Activar el gate en Producción solo después de las pruebas y con rollback listo.
