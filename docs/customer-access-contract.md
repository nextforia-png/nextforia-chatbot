# Contrato compartido de acceso de clientes

Fecha: 21 de julio de 2026  
Versión: `customer-access-v2`  
Estado: congelado para coordinación entre Super Admin y Customer Panel

## Principios

- No existe registro público, gratuito ni un segundo flujo de onboarding.
- La única identidad de cliente es un correo normalizado: `trim().toLowerCase()`.
- El Super Admin crea el tenant y su membresía administradora pendiente.
- El cliente únicamente acepta una invitación privada y define su contraseña.
- Un administrador cliente pertenece a un solo tenant.
- Tokens, contraseñas, hashes y secretos nunca aparecen en respuestas, auditoría o logs.
- El flujo v2 permanece apagado salvo que `CUSTOMER_ACCESS_V2_ENABLED=1`.

## Crear cliente y enviar invitación

### `POST /admin/customer-invite`

Autorización: sesión o `X-Dashboard-Key` con rol efectivo exacto `super_admin`.

Request JSON. No se aceptan campos adicionales:

```json
{
  "company_name": "Empresa Ejemplo S.A.S.",
  "admin_email": "admin@empresa.example",
  "plan_id": "growth",
  "assigned_bot_id": "atencion-cliente"
}
```

Reglas:

- `company_name`: texto de 2 a 120 caracteres.
- `admin_email`: email válido, máximo 254 caracteres; se persiste normalizado.
- `plan_id`: identificador activo existente en el catálogo de planes.
- `assigned_bot_id`: identificador activo existente en el catálogo de bots.
- El correo no puede pertenecer a otro tenant ni tener una invitación activa.
- Tenant, membresía pendiente e invitación se crean en una sola transacción.
- El token contiene 32 bytes aleatorios; solo se persiste su SHA-256.
- La invitación vence según `CUSTOMER_INVITE_TTL_HOURS` (24 horas por defecto), es single-use y revocable.
- El enlace se envía únicamente a `admin_email`; nunca se devuelve en la API.

Response `201`:

```json
{
  "ok": true,
  "tenant": {
    "id": "empresa-ejemplo-a1b2c3",
    "company_name": "Empresa Ejemplo S.A.S.",
    "plan_id": "growth",
    "assigned_bot_id": "atencion-cliente",
    "status": "setup"
  },
  "membership": {
    "email": "admin@empresa.example",
    "role": "admin",
    "status": "pending"
  },
  "invitation": {
    "id": "uuid",
    "status": "sent",
    "delivery_status": "sent",
    "expires_at": "2026-07-22T12:00:00.000Z",
    "used_at": null,
    "revoked_at": null
  }
}
```

Si la transacción persiste pero el proveedor de correo falla, la respuesta es `502` con `error=email_delivery_failed`, `delivery_status=failed` e IDs no sensibles para operación. No se genera automáticamente otra invitación.

## Consultar y revocar invitaciones

### `GET /admin/customer-invitations`

Solo `super_admin`. Devuelve tenants, correo administrador, plan, bot, timestamps y estado calculado, nunca el token ni su hash.

Estados posibles:

- `pending_delivery`: creada, entrega aún no confirmada.
- `sent`: entregada al proveedor.
- `delivery_failed`: el proveedor rechazó o no confirmó la entrega.
- `expired`: `expires_at` quedó en el pasado sin consumo.
- `used`: consumida correctamente.
- `revoked`: revocada por Super Admin.

### `POST /admin/customer-invitations/:invitationId/revoke`

Solo `super_admin`. Es idempotente para una invitación ya revocada. Una invitación usada no se puede revocar.

## Aceptar invitación

### `GET /admin/setup/:tenantId?invite=TOKEN`

Valida el hash del token contra una invitación del mismo tenant, no vencida, no revocada y no usada. Muestra `company_name` y el correo invitado como solo lectura. No solicita username.

### `POST /admin/setup/:tenantId`

Request JSON:

```json
{
  "invite": "TOKEN",
  "password": "contraseña elegida",
  "password_confirmation": "contraseña elegida"
}
```

La contraseña debe tener entre 12 y 128 caracteres, al menos una letra y un número. El servidor genera salt y hash `scrypt`. Una operación atómica bloquea la invitación, vuelve a validar tenant/estado/vencimiento, activa la membresía y marca `used_at`. Dos consumos concurrentes no pueden tener éxito.

Response `201`:

```json
{
  "ok": true,
  "tenant": { "id": "empresa-ejemplo-a1b2c3", "company_name": "Empresa Ejemplo S.A.S." },
  "user": {
    "user_id": "uuid",
    "email": "admin@empresa.example",
    "role": "admin",
    "tenant_id": "empresa-ejemplo-a1b2c3"
  },
  "redirect": "/admin/panel?tab=summary"
}
```

## Login y sesión

### `POST /admin/login`

El login de clientes acepta `email` y `password`. Por compatibilidad, `username` continúa disponible solamente para las cuentas legadas y de plataforma mientras producción use el flujo v1; v2 no crea usernames.

Antes de emitir la cookie, el servidor vuelve a comprobar que la membresía existe, está activa y pertenece a un único tenant.

Payload firmado de sesión v2:

```json
{
  "v": 2,
  "uid": "uuid",
  "e": "admin@empresa.example",
  "n": "admin@empresa.example",
  "r": "admin",
  "t": "empresa-ejemplo-a1b2c3",
  "exp": 1784635200000
}
```

La cookie es `HttpOnly`, `Secure` en HTTPS/producción, `SameSite=Strict`, limitada a `/admin`. El tenant efectivo de un usuario cliente siempre proviene de esta sesión firmada, nunca de URL, query o body.

## Errores

Todos los errores usan `{ "ok": false, "error": "codigo" }`. Los mensajes son opcionales y no revelan si existe una cuenta fuera de los flujos autorizados.

| HTTP | Código | Uso |
|---|---|---|
| 400 | `invalid_request` | JSON con campos faltantes, adicionales o formato inválido |
| 400 | `invalid_company_name` | Nombre fuera de límites |
| 400 | `invalid_email` | Correo inválido |
| 400 | `invalid_plan` | Plan inexistente/inactivo |
| 400 | `invalid_assigned_bot` | Bot inexistente/inactivo |
| 400 | `weak_password` | Contraseña fuera de política |
| 400 | `password_mismatch` | Confirmación diferente |
| 401 | `unauthorized` | Falta autenticación o rol exacto `super_admin` |
| 403 | `invalid_invitation` | Token alterado o tenant diferente |
| 409 | `customer_already_exists` | Empresa/correo ya asignado |
| 409 | `invitation_already_used` | Invitación consumida |
| 409 | `invitation_revoked` | Invitación revocada |
| 410 | `invitation_expired` | Invitación vencida |
| 502 | `email_delivery_failed` | Persistencia correcta y entrega fallida |
| 503 | `customer_access_unavailable` | Feature gate, persistencia o correo no configurados |

## Ownership

### Super Admin

- Mantiene `POST /admin/customer-invite` como único comando de alta.
- Mantiene catálogos de planes/bots, tenants, membresías pendientes, invitaciones, entrega, revocación y auditoría.
- Puede consultar todos los tenants exclusivamente por rutas de plataforma auditadas.
- No opera conversaciones de clientes desde estas rutas.

### Customer Panel

- Mantiene la pantalla `GET/POST /admin/setup/:tenantId` conforme a este contrato.
- Mantiene login por email, sesión, autorización y consultas/mutaciones derivadas del `tenant_id` firmado.
- No crea tenants ni invitaciones y no agrega signup público.
- No cambia request/response, estados o semántica de este documento sin coordinación explícita con Super Admin.

## Gate y compatibilidad

- Con `CUSTOMER_ACCESS_V2_ENABLED=0` o ausente, se conserva el comportamiento legado de producción.
- Con `CUSTOMER_ACCESS_V2_ENABLED=1`, se requiere persistencia v2, URL pública del Customer Panel y proveedor de correo configurados para el mismo entorno de Staging.
- Staging debe usar base de datos, claves, cookies, dominio y proveedor/buzón de correo distintos de producción.
