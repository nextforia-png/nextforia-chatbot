# Customer Panel access v2 — Staging handoff

Fecha: 22 de julio de 2026  
Entorno: Staging únicamente  
Feature gate: `CUSTOMER_ACCESS_V2_ENABLED=1`

## Alcance

- La única alta de clientes comienza en `POST /admin/customer-invite`, operado por Super Admin.
- El cliente acepta la invitación existente en `GET/POST /admin/setup/:tenantId`.
- El correo invitado se muestra como solo lectura.
- No se solicita ni crea username.
- El login del cliente usa exclusivamente correo y contraseña.
- No existe signup público ni endpoint alternativo de registro.
- El flujo legado permanece intacto cuando el feature gate está apagado.

La fuente de verdad contractual es `docs/customer-access-contract.md`, incorporada desde el commit `741c4b824e51d7df60a23bac00d2e2b551a40c99` de `codex/staging-super-admin`.

## Matriz de entrega

| Caso | Resultado esperado | Evidencia |
|---|---|---|
| Email invitado correcto | Activa membresía y permite login | E2E `customer-panel-access-v2.e2e.test.js` |
| Contraseña débil | `400 weak_password` | Unit `customer-access-v2.test.js` |
| Confirmación diferente | `400 password_mismatch` | E2E Customer Panel |
| Token alterado | `403 invalid_invitation` | Unit Customer Access v2 |
| Token vencido | `410 invitation_expired` | E2E Customer Panel |
| Token revocado | `409 invitation_revoked` | E2E Customer Panel |
| Token usado | `409 invitation_already_used` | E2E Customer Panel |
| Token de tenant incorrecto | `403 invalid_invitation` | E2E Customer Panel |
| Segundo consumo concurrente | Solo uno puede responder `201` | Unit Customer Access v2 |
| Login por username nuevo | Rechazado; no se crean usernames v2 | E2E Customer Panel |
| Signup alternativo | `404` o `403` | E2E Customer Panel |
| Lectura A → B | A conserva su tenant y no recibe datos de B | E2E Customer Panel |
| Escritura A → B | Query/body de B se ignoran y la escritura queda en A | E2E Customer Panel |
| Cookie con tenant alterado | Firma inválida; sesión rechazada | E2E Customer Panel |
| Membresía inactiva | Sesión firmada deja de funcionar | Unit + E2E Customer Panel |
| Gate apagado | Comportamiento legado sin regresión | Suite completa + `appointments.e2e.test.js` |

## Evidencia de aislamiento

- El tenant efectivo se deriva de la cookie firmada v2 y se revalida contra una membresía activa en cada request autenticado.
- `tenant_id` recibido por query o body no participa en la selección del tenant del cliente.
- El setup de cliente persiste registros con un identificador y `tenantId` derivados de la sesión.
- Las consultas globales de conversaciones no se ejecutan para un tenant v2; mientras una fuente operativa multi-tenant no esté conectada, el panel devuelve un estado vacío y aislado.
- Las tablas de acceso tienen RLS forzado; `anon` y `authenticated` no reciben permisos, y los RPC de plataforma exigen `service_role`.
- El shell v2 obtiene `company_name`, `plan_id` y `assigned_bot_id` al revalidar la membresía activa; no usa el branding ni los módulos del tenant legado.
- Cada sesión v2 recibe solamente el selector del bot asignado. La matriz A/B cubre Atención al cliente frente a Agendamiento sin cruce de nombres, planes o módulos.

## QA visual completado

- Login v2: escritorio 1280 × 720 y móvil 390 × 844.
- Setup de contraseña: escritorio 1280 × 720 y móvil 390 × 844.
- Sin overflow horizontal en ambos tamaños.
- Email de invitación en modo solo lectura.
- Sin campos de username o nombre.
- Sin CTA de registro público.

## Rollback

1. Apagar `CUSTOMER_ACCESS_V2_ENABLED` en Staging.
2. Reiniciar el servicio de Staging.
3. Confirmar que el login y setup legados vuelven a responder como antes.
4. Si se requiere revertir persistencia, aplicar la migración down documentada por Super Admin solo después de respaldar y verificar que no existan invitaciones/membresías v2 necesarias.

El gate es el rollback inmediato. No se debe aplicar esta migración ni activar el gate en producción sin aprobación explícita.
