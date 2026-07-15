# Division Admin y Super admin

Fecha: 11 de julio de 2026

Estado: division visual v1 implementada; aislamiento multi-tenant pendiente.

## Objetivo

Mantener dos experiencias con responsabilidades distintas mientras el producto se prepara para otros comercios:

- **Admin:** panel del cliente/comercio.
- **Super admin:** panel interno de NexforIA.

El dashboard de RAV Toys conserva su operacion actual. La ruta `/admin/super-admin` agrega una vista separada para NexforIA sin mover conversaciones ni configurar routing multi-tenant todavia.

## Roles

| Rol | Dueno | Alcance | Uso esperado |
|---|---|---|---|
| `super_admin` | NexforIA | Plataforma | Tenants, integraciones, salud global, readiness comercial y configuracion sensible |
| `admin` | Cliente | Un comercio | Metricas, usuarios operativos, pruebas del bot y supervision del negocio |
| `agent` | Cliente | Un comercio | Intervencion humana, respuestas, notas y etiquetas |
| `viewer` | Cliente | Un comercio | Solo lectura de metricas y conversaciones |

## Que queda en Admin

El panel Admin debe enfocarse en operacion diaria del negocio:

- Resumen de metricas.
- Conversaciones recientes.
- Intervencion humana.
- Etiquetas y notas internas.
- Pruebas controladas del bot.
- Usuarios del equipo del cliente.
- Reportes simples para ventas, soporte y oportunidades.

## Que queda en Super admin

El panel Super admin debe enfocarse en plataforma y soporte tecnico:

- Lista de tenants/clientes.
- Estado de Meta, Shopify, Supabase y Anthropic por cliente.
- Configuracion de integraciones.
- Variables por tenant: `phone_number_id`, WABA ID, dominio Shopify y prefijos de pedido.
- Readiness comercial.
- Plantillas WhatsApp por cliente.
- Alertas globales y salud operativa.
- Acciones sensibles como reset, smoke tests globales, migraciones y futuras llaves.

## Estado actual implementado

- Se agrego el rol `super_admin` por encima de `admin`.
- La clave maestra `DASHBOARD_KEY` se interpreta como `super_admin`.
- `super_admin` hereda los permisos actuales de `admin`.
- Los roles `admin`, `agent` y `viewer` siguen funcionando igual.
- Se agrego el endpoint `/admin/access-model` para exponer el modelo de acceso actual y futuro.
- El endpoint `/admin/commercial-readiness` ya incluye `super_admin` dentro de los roles recomendados.
- Se agrego `/admin/super-admin`, protegido por igualdad exacta de rol `super_admin`; `admin`, `agent` y `viewer` reciben acceso restringido.
- El dashboard operativo muestra el enlace **Super admin** solo para una sesion `super_admin` o la clave maestra.
- Super Admin Panel v1 resume version, salud, modelo de acceso, readiness comercial, campos de onboarding, tenant default y proximos pasos sin mostrar valores sensibles.

## Configuracion de usuarios

Formato CSV:

```text
nexforia:CLAVE_SEGURA:super_admin:Santiago,adminrav:CLAVE_SEGURA:admin:Admin RAV,asesora:CLAVE_SEGURA:agent:Asesora,visor:CLAVE_SEGURA:viewer:Visor
```

Formato JSON:

```json
[
  { "username": "nexforia", "password": "CLAVE_SEGURA", "role": "super_admin", "name": "NexforIA" },
  { "username": "adminrav", "password": "CLAVE_SEGURA", "role": "admin", "name": "Admin RAV" },
  { "username": "asesora", "password": "CLAVE_SEGURA", "role": "agent", "name": "Asesora" },
  { "username": "visor", "password": "CLAVE_SEGURA", "role": "viewer", "name": "Visor" }
]
```

## Fases recomendadas

1. **Base de roles:** listo en `v59`.
2. **Vista Super admin:** lista en `v60` con readiness, salud global normalizada y preparacion tecnica.
3. **Tenant default:** RAV Toys ya opera como cliente #1 con `tenant_id = rav-toys` en el Panel de Control.
4. **Usuario inicial del tenant:** RAV Toys crea su administrador mediante invitación firmada y contraseña persistente con hash. Antes del segundo cliente, mover este registro interno a una tabla dedicada por tenant.
5. **Aislamiento por tenant:** limitar datos, usuarios y configuracion del panel Admin al comercio autenticado.
6. **Multi-cliente real:** resolver tenant por `phone_number_id` entrante y aislar datos/configuracion.

## Regla de seguridad

Antes de vender a otro cliente, ninguna asesora o admin de un comercio debe poder ver conversaciones, tokens, metricas o configuracion de otro comercio.
