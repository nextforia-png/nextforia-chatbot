# Informe ejecutivo para socios

Proyecto: RAV WhatsApp Bot / NexforIA Bots

Fecha: 7 de julio de 2026

Estado general: infraestructura lista en producción; pendiente aprobación final de Meta para uso amplio de WhatsApp Business Platform.

## 1. Resumen ejecutivo

Durante las últimas semanas construimos y desplegamos un bot operativo de WhatsApp para RAV Toys, con IA, integración con Shopify, dashboard de operación, intervención humana, trazabilidad en Supabase, alertas y una primera base para comercializar el modelo a otros comercios.

El producto ya no es solo una prueba conversacional. Hoy existe una infraestructura funcional en producción (`v58`) con:

- Bot de ventas y atención para WhatsApp.
- Búsqueda de productos en catálogo Shopify.
- Flujo de carrito, datos de pedido, pagos, garantías y envíos.
- Consulta de estado de pedidos con validación de identidad.
- Dashboard operativo con métricas e intervención humana.
- Roles de acceso para equipo: `admin`, `agent`, `viewer`.
- Notas internas y etiquetas por cliente.
- Alertas operativas por WhatsApp.
- Documentación comercial y roadmap multi-cliente.

El bloqueo principal no es técnico: Meta aún mantiene en revisión los permisos `whatsapp_business_messaging` y `whatsapp_business_management`. No hay acciones requeridas pendientes por nuestra parte.

## 2. Estado actual de producción

Producción verificada el 7 de julio de 2026:

| Área | Estado |
|---|---|
| Versión activa | `v58` |
| Servicio Render | Activo |
| Meta WhatsApp API | OK |
| Shopify storefront | OK |
| Shopify Admin token | Presente |
| Supabase logs | OK |
| Anthropic API key | Presente |
| Dashboard operativo | Activo |
| App Review Meta | En revisión |

Conclusión: el sistema está técnicamente listo para operar, pero depende de la aprobación externa de Meta para abrir el canal real a clientes de forma estable.

## 3. Lo que ya construimos

### Bot conversacional

El bot atiende clientes con tono de marca RAV Toys y puede:

- Saludar y orientar al cliente.
- Buscar productos en Shopify.
- Recomendar hasta 3 productos por turno.
- Enviar tarjetas de producto por WhatsApp.
- Guiar cierre de compra.
- Capturar datos de pedido.
- Explicar envíos, pagos y garantías.
- Detectar casos que deben pasar a humano.
- Solicitar calificación post-atención.

### Integración Shopify

El bot consulta el catálogo real de RAV Toys y usa datos de Shopify para:

- Buscar productos disponibles.
- Mostrar precios y links reales.
- Mantener carrito interno.
- Consultar estado de pedidos por número y nombre.
- Devolver información de guía/rastreo cuando la identidad coincide.

Prueba real realizada:

- Pedido `1154` reconocido como `RAV-1154`.
- Nombre correcto: devuelve estado `despachado` y guía.
- Nombre incorrecto: no revela datos ni tracking.

Esto es importante porque protege información del cliente y evita exponer datos privados por solo conocer un número de pedido.

### Dashboard operativo

El dashboard ya permite:

- Ver métricas generales.
- Consultar conversaciones recientes.
- Entrar a la pestaña de intervención humana.
- Tomar control de un chat.
- Responder desde el panel usando WhatsApp Cloud API.
- Devolver la conversación al bot.
- Ver estado de infraestructura.
- Copiar número del cliente.
- Buscar conversaciones por teléfono, mensaje o etiqueta.

### Intervención humana

Se construyó un modelo human-in-the-loop:

- El bot puede pasar conversaciones a humano.
- Una asesora puede tomar control manualmente.
- Mientras el humano tiene control, el bot no responde automáticamente.
- Al finalizar, la asesora puede devolver la conversación al bot.
- Todo queda registrado en Supabase.

Esto resuelve una preocupación clave: el bot no reemplaza ciegamente al equipo, sino que permite supervisión e intervención cuando sea necesario.

### Notas y etiquetas internas

El panel permite clasificar clientes con:

- `venta`
- `garantia`
- `pendiente_pago`
- `envio`
- `revisar`

También permite guardar notas internas por cliente. Estas notas quedan persistidas como eventos internos, sin mostrarse como mensajes del chat.

### Usuarios y roles

Se agregó base de seguridad para operar con equipo:

| Rol | Permisos |
|---|---|
| `admin` | Configuración, métricas, pruebas y administración |
| `agent` | Intervención humana, respuestas, notas y etiquetas |
| `viewer` | Solo lectura |

La clave maestra actual sigue funcionando, pero el sistema ya está preparado para usuarios separados por persona.

### Alertas operativas

Se implementaron alertas para:

- Fallas de Meta, Shopify, Supabase o Anthropic.
- Chats humanos pendientes por demasiado tiempo.
- Errores técnicos.
- Búsquedas repetidas sin resultado.
- Problemas de saldo/créditos de IA.

También se agregó cooldown anti-spam para no inundar al equipo con la misma alerta repetida.

Prueba realizada:

- Envío real de alerta por WhatsApp: OK.
- Segundo envío duplicado: bloqueado por cooldown.

### Plantillas WhatsApp

Se prepararon plantillas para:

- Confirmación de pedido.
- Instrucciones de pago.
- Actualización de envío.
- Garantía recibida.
- Seguimiento humano.
- Postventa.
- Carrito abandonado.
- Producto disponible.
- Recomendación de producto.

Varias ya fueron cargadas en WhatsApp Manager; algunas siguen sujetas a revisión/clasificación de Meta.

### Playbook comercial

Se documentó un playbook para asesoras con criterios de:

- Cuándo tomar control.
- Cómo cerrar una venta.
- Cómo manejar objeciones.
- Cómo responder pagos, envíos, Addi, contraentrega y garantías.
- Cuándo devolver la conversación al bot.

Este documento permite entrenar a una asesora nueva con menor dependencia del fundador/equipo técnico.

## 4. Preparación para comercializar

Ya dejamos una primera base para vender el modelo a otros comercios.

### Checklist de onboarding

Se creó un flujo comercial para nuevos clientes:

1. Calificación inicial.
2. Recolección de accesos.
3. Configuración técnica.
4. Prueba controlada.
5. Salida a producción.

Documento: `docs/commercial-onboarding.md`

### Roadmap multi-cliente

Se definió como evolucionar desde RAV Toys como primer caso hacia una plataforma multi-cliente:

- `tenant_id` por comercio.
- Configuración independiente por cliente.
- WhatsApp, Shopify, usuarios y alertas por tenant.
- Dashboard separado por cliente.
- Futura conexión con Embedded Signup de Meta.

Documento: `docs/multi-tenant-roadmap.md`

### Endpoint de readiness comercial

Se agregó `/admin/commercial-readiness`, que devuelve:

- Etapas de onboarding.
- Campos mínimos por cliente.
- Roles recomendados.
- Bloqueador actual.
- Próximo trabajo sugerido.

Esto nos permite convertir el dashboard en una herramienta comercial y operativa, no solo técnica.

## 5. Validaciones realizadas

Hasta ahora se han validado:

- Deploy automático en Render desde GitHub.
- Health check de producción.
- Conexión Meta API.
- Conexión Shopify storefront.
- Lectura de conversaciones desde Supabase.
- Dashboard operativo.
- Intervención humana.
- Notas y etiquetas.
- Roles locales: `admin`, `agent`, `viewer`.
- Consulta real de pedido Shopify.
- Alerta operativa real.
- Endpoint comercial `/admin/commercial-readiness`.

## 6. Bloqueadores actuales

### Bloqueador principal: Meta App Review

Estado verificado el 7 de julio de 2026:

- App: RAV Toys Chat Bot.
- App ID: `1506359908170226`.
- Estado: revisión en curso.
- Permisos en revisión:
  - `whatsapp_business_messaging`
  - `whatsapp_business_management`
- Acciones requeridas: ninguna.

Esto significa que no hay corrección pendiente por nuestra parte; dependemos del tiempo de revisión de Meta.

### Bloqueador secundario: GitHub workflow

El workflow automático de monitoreo está listo localmente, pero no se pudo subir porque el token actual de GitHub no tiene permiso `workflow`.

Impacto: las alertas funcionan manualmente y desde backend, pero falta activar el cron automático en GitHub Actions.

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación implementada |
|---|---|
| Bot responde cuando humano debe intervenir | Handoff humano pausa respuestas automáticas |
| Exposición de datos de pedidos | Validación por nombre antes de mostrar guía |
| Perder trazabilidad por reinicios de Render | Logs persistentes en Supabase |
| Asesoras compartiendo una sola clave | Base de usuarios/roles lista |
| Alertas repetidas | Cooldown anti-spam |
| Comercialización sin proceso | Checklist de onboarding y roadmap multi-cliente |
| Dependencia de Meta | Sistema listo; bloqueo identificado como externo |

## 8. Valor para el negocio

Este avance permite demostrar a socios que el proyecto ya tiene valor en tres niveles:

### Operativo

Reduce carga de atención repetitiva, permite responder más rápido y mantiene control humano.

### Comercial

Ayuda a cerrar ventas por WhatsApp, recomienda productos y permite medir oportunidades de catálogo.

### Plataforma

La base ya no está pensada solo para RAV Toys. Se comenzó a preparar una arquitectura para vender a otros comercios con onboarding, roles, tenants y checklist operativo.

## 9. Próximos pasos recomendados

### Inmediato, cuando Meta apruebe

1. Probar mensaje real entrante desde WhatsApp.
2. Probar consulta de pedido por WhatsApp.
3. Configurar usuarios reales del dashboard en Render.
4. Activar alertas automáticas con GitHub Actions.
5. Ejecutar prueba de humo completa post-aprobación.

### Mientras Meta termina revisión

1. Completar historial por cliente con paginación.
2. Crear demo limpia para socios/clientes.
3. Preparar pitch de una página.
4. Definir pricing inicial.
5. Empezar Fase A del roadmap multi-cliente: `tenant_id` default para RAV.

### Para piloto comercial

1. Elegir un comercio candidato.
2. Levantar accesos requeridos.
3. Configurar tenant manualmente.
4. Medir primera semana de operación.
5. Convertir aprendizajes en paquete comercial.

## 10. Conclusión

El proyecto avanzó de una prueba técnica a una base real de producto. Hoy tenemos un bot funcional, dashboard operativo, integración con Shopify, trazabilidad, alertas, intervención humana y primeros cimientos de comercialización.

La principal espera actual es Meta. El equipo ya adelantó la mayor parte de lo que se podía construir antes de la aprobación: infraestructura, seguridad, operación, documentación y ruta multi-cliente.

Cuando Meta apruebe, el siguiente hito no será empezar desde cero, sino activar, probar con mensajes reales y pasar a piloto operativo.
