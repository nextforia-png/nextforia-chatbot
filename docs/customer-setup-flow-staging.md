# Customer Setup Flow — Staging

Fecha: 2026-07-25
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
- `setup_goal`
- `meta.whatsapp_number`
- `meta.whatsapp_integration_intent`
- `meta.whatsapp_integration_status`
- `appointment_setup.business_name`
- `appointment_setup.business_category`
- `appointment_setup.target_customer`
- `appointment_setup.business_description`
- `appointment_setup.assistant_tone`
- `appointment_setup.bot_display_name`
- `appointment_setup.bot_image`
- `appointment_setup.allowed_topics`
- `appointment_setup.forbidden_topics`
- `appointment_setup.escalation_triggers`
- `appointment_setup.escalation_contact`
- `appointment_setup.services`
- `appointment_setup.business_hours`
- `appointment_setup.payment_methods`
- `appointment_setup.faqs`
- `appointment_setup.knowledge_documents`
- `appointment_setup.staff_mode`
- `appointment_setup.appointment_locations`
- `appointment_setup.availability_rules`
- `appointment_setup.required_booking_fields`
- `appointment_setup.booking_confirmation_mode`
- `appointment_setup.cancellation_policy`
- `appointment_setup.calendar_provider`
- `appointment_setup.reminder_channel`
- `appointment_setup.reminder_timing`
- `appointment_setup.survey_enabled`
- `appointment_setup.operational_channels`
- `appointment_setup.social_accounts`
- `appointment_setup.data_consent`
- `appointment_setup.data_consent_version`
- `appointment_setup.data_consent_accepted_at`
- `appointment_setup.setup_status`
- respuestas del negocio, operación, equipo y estilo de comunicación

El `tenant_id` nunca se acepta desde URL, query o body: se deriva de la sesión
Customer Access v2 y todas las lecturas/escrituras usan ese tenant.

## Plan y bot

Los planes disponibles y el bot asignado se leen de los catálogos activos administrados
por Super Admin. El cliente puede elegir directamente un plan compatible con su bot y
continúa al pago/configuración correspondiente sin autorización manual de Super Admin.

Mejora v147: la pantalla final de selección de plan implementa el diseño
`Selección de planes Nextfor` en Staging. Muestra Aura, Tempo y Atlas en cards
responsive con Lumen por plan, recomendación visual según el objetivo del setup,
detalle expandible de lo que incluye/no incluye, banner secundario de Nextfor Uno
y bloque Signature. Los IDs, precios y compatibilidad siguen viniendo del catálogo
central del ambiente; el diseño solo aporta presentación y copy.
La selección actualiza el `plan_id` de su propio tenant; no requiere autorización
de Super Admin. Los precios no se escriben ni se editan en el Customer Panel.

Corrección v101: si Supabase aplica el cambio de plan pero no devuelve la fila
actualizada en el `PATCH`, el Customer Panel lee inmediatamente el tenant por `id`
antes de reportar error. Así el botón "Terminar configuración" no queda bloqueado
por una respuesta sin representación.

Mejora v102: el primer paso del setup pregunta si el cliente quiere integrar su
WhatsApp con Meta desde Nextfor IA. La respuesta se guarda en
`meta.whatsapp_integration_intent`; cuando responde "sí", queda como
`meta.whatsapp_integration_status=requested`. Esto deja el dato listo para el flujo
automático/guided setup con Meta sin marcar la integración como conectada antes de
tener permisos reales.

Mejora v109: el setup inicia con la pregunta de objetivo `setup_goal`
(`customer_service`, `appointments`, `both`). Cuando el cliente elige
`appointments` o `both`, el recorrido cambia a la narrativa de entrenamiento:
"estás entrenando a Nextfor como nuevo integrante de tu equipo". Usa el asset
`/admin/assets/lumen-entrenando.png` como mascota del setup y muestra las etapas
de Agendamiento: Tu negocio, Sus reglas, Su conocimiento, Tu agenda, Seguimiento,
Canales, Revisión y Plan. Este camino no exige ni modifica las preguntas del
ChatBot de atención al cliente.

Al finalizar un setup de Agendamiento, `appointment_setup.setup_status` queda como
`pending_review` y se registran los datos de consentimiento (`data_consent`,
`data_consent_version`, `data_consent_accepted_at`) dentro del mismo registro
central del tenant.

El asset de Lumen Entrenando se publica como `/admin/assets/lumen-entrenando.png`
optimizado para carga rápida en móvil.

Corrección v110: la pantalla de bienvenida usa narrativa general de entrenamiento
("trabajar por tu negocio") y no presenta el setup como si fuera únicamente para
Agendamiento de Citas.

Mejora v113: el camino `customer_service` incorpora la etapa 1 real de Atención al
Cliente: narrativa de vendedor, nombre comercial, país/ciudad principal, tipo de
oferta, descripción corta, cliente ideal, propuesta de valor, nombre visible de
Nextfor, tono comercial, restricciones de marca, logo con vista previa y
consentimiento obligatorio antes de terminar. El setup de Agendamiento permanece
separado y sin regresiones.

Mejora v114: ambos setups preguntan cuántos clientes atiende normalmente la línea
en un mes y guardan el aproximado en `operations.monthly_customer_volume`. Este
dato queda listo para recomendación de plan, estimación de capacidad y cálculo
de consumo de tokens por cliente.

Corrección v115: al elegir `both`, el onboarding recorre las etapas de Atención
al Cliente y Agendamiento, muestra los dos bloques necesarios en la página de
negocio y valida solo datos visibles/esperados por paso. Esto evita que el
cliente quede bloqueado en la segunda página por campos invisibles.

Mejora v116: cuando falta una casilla o campo obligatorio, el setup muestra un
mensaje con el nombre exacto de lo pendiente, marca en rojo inputs, radios,
checkboxes, selección de objetivo y planes, y lleva al cliente al primer campo
faltante.

Mejora v118: el cuestionario autoguarda borradores mientras el cliente escribe o
avanza, permite salir y continuar luego, muestra un resumen simple antes de
confirmar y sigue persistiendo estados `draft`/`completed`, `last_updated_at` y
`setup_completed_at` en el mismo registro compartido `client-onboarding:{tenant}`.
No activa bots automáticamente ni duplica datos.

## Borrador de configuración de Customer Service

Después de aprobar el setup, Super Admin puede generar
`customer_service_configuration` dentro del mismo registro
`client-onboarding:{tenant}`. No se crea otra tabla, otro identificador de
persistencia ni otro sistema de configuración.

La transición es deliberada:

1. `Ready`: respuestas completas; Super Admin debe ejecutar `Aprobar setup` para
   cambiar `customer_service_setup.setup_status` de `pending_review` a `approved`.
2. `Building`: después de esa aprobación explícita, se genera un borrador
   estructurado únicamente con respuestas generales
   y de `customer_service_setup`.
3. `Testing`: Super Admin revisó, editó y aprobó la configuración para pruebas
   internas.

`appointment_setup` nunca entra al borrador de Customer Service. Los cambios a una
configuración que ya estaba en `Testing` la devuelven a `Building` y exigen otra
aprobación. Este flujo no ofrece acción `Live` ni publica instrucciones en
conversaciones reales.

El borrador de Customer Service incluye la sección interna `Despliegue y QA`, que
se muestra a Super Admin y pasa al prompt/configuración revisada del bot. Esta
sección es genérica para cualquier cliente y no contiene referencias a un tenant
piloto.

## Integración comercial en el setup

Customer Service pregunta si el negocio usa Shopify, WordPress + WooCommerce,
WordPress sin tienda, otra plataforma o no tiene tienda. El mismo registro guarda:

- plataforma y URL pública;
- intención y estado de conexión;
- estado del catálogo;
- necesidad de consultar pedidos;
- responsable que autorizará la conexión.

El setup nunca solicita ni almacena contraseñas, tokens o claves privadas. Una
respuesta `integration_intent=yes` queda como `integration_status=requested` para
que Super Admin continúe después mediante el flujo autorizado de la plataforma.
WordPress sin WooCommerce puede servir como fuente de contenido, pero la consulta
transaccional de pedidos requiere WooCommerce u otra integración de pedidos.

## Contrato de preguntas

`CUSTOMER_SETUP_QUESTIONS` mantiene identificador estable, ruta de respuesta, sección,
orden, estado activo, obligatoriedad, tipo y etiqueta. Esto permite que Super Admin
pueda administrar preguntas en una fase posterior sin cambiar la forma de las
respuestas existentes.

## 14. Despliegue a Staging y Producción

Implementar primero en **Staging** para validar que los cambios funcionan correctamente
y no afectan el onboarding existente.

### Pruebas obligatorias en Staging

- Venta con y sin envío.
- Diferentes medios de pago.
- Recepción de comprobantes pendientes de validación.
- Producto agotado.
- Pedido no encontrado.
- Cliente fuera de cobertura.
- Escalamiento sin humano disponible.
- Flujo `setup_goal = both`.
- Ausencia de preguntas duplicadas.
- Guardado automático y recuperación del progreso.
- Consentimiento de datos.
- Edición del resumen final.
- Compatibilidad con datos existentes.

### Paso a Producción

Cuando todas las pruebas sean satisfactorias:

1. Crear respaldo de la base de datos y configuración actual.
2. Ejecutar las migraciones necesarias de forma segura.
3. Desplegar el onboarding actualizado a **Producción**.
4. Probar nuevamente el recorrido completo en Producción.
5. Confirmar que el Customer Panel y los flujos existentes siguen funcionando.
6. Mantener un procedimiento de rollback disponible.

**Esta instrucción autoriza el despliegue a Producción una vez superadas las pruebas
de Staging.**

### Entrega final

Reportar:

- URL de Staging.
- URL de Producción.
- Cambios realizados.
- Variables creadas o modificadas.
- Migraciones ejecutadas.
- Pruebas realizadas.
- Riesgos, limitaciones o pendientes encontrados.

## Próximo trabajo de Super Admin

- Implementar el flujo real de conexión con Meta/WhatsApp Cloud API a partir de
  `meta.whatsapp_integration_intent=requested`, con estados auditables y manejo de
  permisos/verificación del dueño.
- Implementar procesamiento real de documentos, conexión real de calendarios y
  estados de canales controlados desde Super Admin.
- Exponer revisión/aprobación/activación de `appointment_setup.setup_status`.

## Rollback

Revertir el commit de esta entrega restaura la UI anterior. Con
`CUSTOMER_ACCESS_V2_ENABLED=0`, el flujo nuevo queda fuera del camino de producción y
el comportamiento legado continúa sin cambios. No hay migración SQL que revertir.
