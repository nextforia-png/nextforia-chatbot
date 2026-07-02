# TODO RAV WhatsApp Bot

Backlog operativo despues de dejar App Review enviada y produccion en `v50`.

## En curso

- [ ] Cargar y aprobar plantillas WhatsApp iniciales.
  - Archivo base: `docs/whatsapp-templates.md`
  - Done: plantillas aprobadas en WhatsApp Manager y probadas con el numero de RAV.

## Alta prioridad

- [ ] Alertas operativas de chats pendientes.
  - Avisar por WhatsApp si hay chats en filtro `Pendientes` por mas de X minutos.
  - Avisar si `Meta`, `Shopify`, `Supabase` o `Anthropic` fallan en `/admin/health`.
  - Done: alertas configurables por env vars y prueba manual desde `/admin/alert`.

- [ ] Playbook comercial.
  - Definir cuando toma control una asesora, cuando devuelve al bot y como cerrar venta.
  - Incluir scripts para pago, contraentrega, Addi, garantia, envio Medellin y objeciones.
  - Done: documento operativo usable por una asesora nueva.

- [ ] Hardening del panel.
  - Usuarios/roles en vez de una sola clave compartida.
  - Notas internas por cliente.
  - Etiquetas: `venta`, `garantia`, `pendiente_pago`, `envio`, `revisar`.
  - Historial por cliente con busqueda y paginacion.
  - Done: panel listo para mas de una persona operando.

## Media prioridad

- [ ] Preparar comercializacion del modelo.
  - Demo limpia.
  - Pitch de 1 pagina.
  - Pricing inicial.
  - Checklist de onboarding para futuros clientes.
  - Done: paquete listo para mostrar a un comercio piloto.

- [ ] Mejorar capacidades del bot.
  - Manejo de imagenes/comprobantes.
  - Manejo de audios o transcripcion.
  - Sinónimos de productos y terminos locales.
  - Recomendaciones por edad, presupuesto y ocasion.
  - Done: pruebas reales muestran menos handoffs y menos busquedas sin resultado.

## Baja prioridad

- [ ] Automatizar envio de plantillas aprobadas.
  - Crear helper `sendTemplate`.
  - Agregar endpoint admin de prueba.
  - Agregar proteccion para no enviar marketing sin consentimiento/opt-out.
  - Done: envio probado con templates aprobadas y logs en Supabase.

- [ ] Panel de metricas comerciales.
  - Ventas iniciadas.
  - Ventas cerradas.
  - Motivos de perdida.
  - Productos mas preguntados.
  - Done: KPIs visibles en dashboard.

- [ ] Staging permanente.
  - Servicio Render separado.
  - Variables separadas.
  - Numero/test WABA separado si es posible.
  - Done: deploy de prueba sin tocar produccion.
