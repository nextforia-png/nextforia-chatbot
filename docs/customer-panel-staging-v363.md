# Customer Panel Staging v363 — Conversaciones

Fecha: 2026-08-11

## Alcance

- Recrea en `customer-panel.js` la presentación aprobada de Conversaciones sobre los datos y endpoints reales existentes.
- Conserva búsqueda, notas, etiquetas, sugerencia de nombre, carga histórica, navegación exacta desde notificaciones y aislamiento por tenant.
- Añade filtros visuales por WhatsApp, Instagram, Messenger, correo y llamada sin crear datos ni canales simulados.
- Presenta la bandeja en tres columnas cuando hay espacio, dos columnas en escritorio compacto y una vista lista → conversación en móvil.
- Integra el relevo IA ↔ humano junto al compositor. En producción, las mismas acciones siguen usando los endpoints existentes de tomar control, responder, resolver y devolver a la IA.
- El `panel-demo` continúa usando datos marcados como demo y nunca envía mensajes externos.

## Compatibilidad

- Todo el rediseño queda detrás de `CUSTOMER_PANEL_REDESIGN_V1_ENABLED`.
- Con el gate apagado se conserva el HTML y comportamiento legado.
- No se modifican contratos, base de datos, autenticación, derivación de `tenant_id`, canales, pagos ni lógica del bot.
- Los gates de planes permanecen intactos: Uno/Aura solo Atención; Tempo solo Agendamiento; Atlas ambos.

## QA requerido

- Escritorio: lista, hilo y perfil; en ancho compacto, lista e hilo sin perder el contexto.
- Móvil: la entrada abre la lista; seleccionar abre el hilo; volver cierra el hilo.
- Filtros de estado/canal, búsqueda, tomar control, escribir/enviar, devolver a la IA y enlace directo a conversación.
- Gate ON/OFF y suite de seguridad/regresión completa.
