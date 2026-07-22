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
| Email invitado correcto | Activa membresía y permite login | Pendiente de suite integrada |
| Contraseña débil | `400 weak_password` | Pendiente de suite integrada |
| Confirmación diferente | `400 password_mismatch` | Pendiente de suite integrada |
| Token alterado | `403 invalid_invitation` | Pendiente de suite integrada |
| Token vencido | `410 invitation_expired` | Pendiente de suite integrada |
| Token revocado | `409 invitation_revoked` | Pendiente de suite integrada |
| Token usado | `409 invitation_already_used` | Pendiente de suite integrada |
| Token de tenant incorrecto | `403 invalid_invitation` | Pendiente de suite integrada |
| Segundo consumo concurrente | Solo uno puede responder `201` | Pendiente de suite integrada |
| Login por username nuevo | Rechazado; no se crean usernames v2 | Pendiente de suite integrada |
| Signup alternativo | `404` o `403` | Pendiente de suite integrada |
| Lectura A → B | Rechazada sin revelar datos | Pendiente de suite integrada |
| Escritura A → B | Rechazada sin mutar B | Pendiente de suite integrada |
| Membresía inactiva | Sesión deja de funcionar | Pendiente de suite integrada |
| Gate apagado | Comportamiento legado sin regresión | Smoke local validado |

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
