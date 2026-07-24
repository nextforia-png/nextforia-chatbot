# Customer Setup Flow — Staging

Fecha: 2026-07-24
Alcance: Customer Panel de Nextfor IA, únicamente en Staging.

## Fuente de diseño

El flujo visual implementado reproduce la estructura, textos y tokens del proyecto
`Customer Setup Flow` entregado en Claude Design. El paquete exportado se usó como
handoff visual; su prototipo `.dc.html` no se incorporó como runtime.

## Recorrido

1. El usuario acepta la invitación y crea su contraseña con Customer Access v2.
2. En el primer ingreso, `GET /admin/panel` comprueba el setup del tenant derivado de
   la sesión firmada.
3. Si `setup_completed` es falso, redirige a `GET /admin/client-onboarding`.
4. El formulario guarda avances con `PUT /admin/client-onboarding/data`.
5. Al completar todos los campos obligatorios guarda el estado `completed` y vuelve
   al Panel de Control.
6. Los ingresos posteriores abren el panel directamente. La ruta de onboarding
   redirige al panel salvo que se abra expresamente con `?edit=1`.

## Persistencia

Se reutiliza el registro central existente `tenant_client_onboarding_v1`, identificado
por `client-onboarding:<tenant_id>`. No se añadió otra base de datos, tabla ni sistema
de registro público.

El documento versionado incluye:

- `questionnaire_version`
- `setup_completed`
- `setup_completed_at`
- `last_updated_at`
- respuestas del negocio, operación, equipo y estilo de comunicación

El `tenant_id` nunca se acepta desde URL, query o body: se deriva de la sesión
Customer Access v2 y todas las lecturas/escrituras usan ese tenant.

## Plan y bot

Los planes disponibles y el bot asignado se leen de los catálogos activos administrados
por Super Admin. El cliente puede elegir directamente un plan compatible con su bot y
la selección actualiza el `plan_id` de su propio tenant; no requiere autorización de
Super Admin. Los precios no se escriben ni se editan en el Customer Panel.

Corrección v101: si Supabase aplica el cambio de plan pero no devuelve la fila
actualizada en el `PATCH`, el Customer Panel lee inmediatamente el tenant por `id`
antes de reportar error. Así el botón "Terminar configuración" no queda bloqueado
por una respuesta sin representación.

## Contrato de preguntas

`CUSTOMER_SETUP_QUESTIONS` mantiene identificador estable, ruta de respuesta, sección,
orden, estado activo, obligatoriedad, tipo y etiqueta. Esto permite que Super Admin
pueda administrar preguntas en una fase posterior sin cambiar la forma de las
respuestas existentes.

## Próximo trabajo de Super Admin

- Exponer una lectura auditada de estos mismos registros para soporte y revisión.
- Mostrar estado, porcentaje, fecha de finalización y última actualización por tenant.
- Permitir añadir, editar, ordenar y activar/desactivar preguntas con versionado.
- Mostrar el plan elegido por el cliente desde el mismo registro central del tenant.

## Rollback

Revertir el commit de esta entrega restaura la UI anterior. Con
`CUSTOMER_ACCESS_V2_ENABLED=0`, el flujo nuevo queda fuera del camino de producción y
el comportamiento legado continúa sin cambios. No hay migración SQL que revertir.
