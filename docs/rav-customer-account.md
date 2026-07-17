# RAV Toys como primer cliente

RAV Toys es el cliente número 1 del Panel de Control y conserva el identificador
`rav-toys` mientras el proyecto continúa en modo single-tenant.

## Creación del acceso

1. Un usuario `super_admin` abre `/admin/super-admin`.
2. Selecciona **Crear acceso RAV**.
3. El panel genera y copia una invitación firmada con vigencia de 24 horas.
4. El administrador de RAV Toys abre la invitación y elige nombre, usuario y contraseña.
5. El sistema crea el usuario con rol `admin`, inicia su sesión y abre `/admin/panel`.

La invitación inicial solo sirve mientras no exista un administrador persistente para
RAV Toys. No es un mecanismo público de registro ni permite crear tenants adicionales.

## Seguridad

- La contraseña requiere mínimo 10 caracteres, una letra y un número.
- Se deriva con `scrypt` y salt aleatorio; nunca se persiste ni registra en texto plano.
- El registro interno queda excluido de conversaciones, KPIs, evaluaciones y APIs del
  cliente.
- El acceso maestro de NexforIA continúa separado como `super_admin`.
- La persistencia depende de Supabase; si no está disponible, no se crea la cuenta.

## Alcance v1

- Un administrador principal para RAV Toys.
- Inicio de sesión por usuario y contraseña.
- Sesión firmada con la misma duración configurada por el dashboard.
- Sin autoservicio para restablecer contraseña todavía; esa será una invitación específica
  de recuperación en una siguiente versión.
