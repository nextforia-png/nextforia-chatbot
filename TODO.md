# TODO RAV WhatsApp Bot

Backlog operativo despues de dejar App Review enviada y produccion en `v56`.

## En curso

- [ ] Estado de pedidos Shopify.
  - Bot consulta pedido por numero + nombre, valida identidad y devuelve guia/rastreo si coincide.
  - Endpoint tecnico: `POST /admin/order-status-test`.
  - Estado 2026-07-02: implementado en `v53` con Shopify Admin GraphQL validado.
  - Estado 2026-07-03: permisos de lectura de pedidos/fulfillments aprobados en Shopify (`rav-whatsapp-bot-4` activa). Prueba tecnica con pedido ficticio ya devuelve `not_found` en vez de `Access denied`.
  - Estado 2026-07-03: `v55` soporta pedidos con prefijo de tienda (`RAV-1154`) aunque el cliente escriba solo `1154`.
  - Estado 2026-07-03: prueba admin real con pedido `1154` + nombre correcto devuelve `despachado` y guia; nombre incorrecto no revela tracking.
  - Pendiente: prueba por WhatsApp con un mensaje real de cliente: "estado de mi pedido 1154, nombre ...".
  - Done: prueba real por admin y por WhatsApp devuelve estado/guia sin revelar datos cuando no coincide.

- [ ] Cargar y aprobar plantillas WhatsApp iniciales.
  - Archivo base: `docs/whatsapp-templates.md`
  - Registro tecnico: `whatsapp-templates.js`
  - Dry run: `POST /admin/template-test`
  - Estado 2026-07-02: las 9 plantillas iniciales fueron cargadas en WhatsApp Manager.
  - Activas con calidad pendiente: `order_confirmation_rav`, `payment_instructions_rav`, `shipping_update_rav`, `warranty_case_received_rav`, `human_followup_rav`.
  - En revision: `post_sale_review_rav`, `abandoned_cart_rav`, `back_in_stock_rav`, `product_recommendation_rav`.
  - Nota: Meta reclasifico `human_followup_rav` como `MARKETING`.
  - Done: plantillas aprobadas en WhatsApp Manager y probadas con el numero de RAV.

## Alta prioridad

- [ ] Alertas operativas de chats pendientes.
  - Avisar por WhatsApp si hay chats en filtro `Pendientes` por mas de X minutos.
  - Avisar si `Meta`, `Shopify`, `Supabase` o `Anthropic` fallan en `/admin/health`.
  - Estado 2026-07-02: `monitor.js` detecta handoffs pendientes por `MONITOR_PENDING_HANDOFF_MINUTES` y `docs/github-actions-safety-checks.yml` deja listo el workflow programado.
  - Estado 2026-07-03: workflow activo en `.github/workflows/rav-bot-safety-checks.yml`; `/admin/alert` envia WhatsApp al equipo con cooldown anti-spam.
  - Estado 2026-07-03: backend de alertas desplegado en `v56`; el token actual de GitHub no tiene permiso `workflow`, por eso el workflow queda listo localmente pero falta subirlo con un token que incluya ese scope.
  - Pendiente: subir `.github/workflows/rav-bot-safety-checks.yml` con permiso `workflow` y confirmar que existe el secret `DASHBOARD_KEY`.
  - Done: alertas configurables por env vars y prueba manual desde `/admin/alert`.

- [x] Playbook comercial.
  - Definir cuando toma control una asesora, cuando devuelve al bot y como cerrar venta.
  - Incluir scripts para pago, contraentrega, Addi, garantia, envio Medellin y objeciones.
  - Estado 2026-07-02: creado `docs/commercial-playbook.md` y enlazado desde README.
  - Done: documento operativo usable por una asesora nueva.

- [ ] Hardening del panel.
  - Usuarios/roles en vez de una sola clave compartida.
  - [x] Notas internas por cliente.
  - [x] Etiquetas: `venta`, `garantia`, `pendiente_pago`, `envio`, `revisar`.
  - Historial por cliente con busqueda y paginacion.
  - Estado 2026-07-03: `v54` agrega notas/etiquetas en la tab Intervención humana, persistidas como eventos internos en `conversation_logs`.
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

- [x] Preparar envio tecnico de plantillas aprobadas.
  - Crear helper `sendTemplate`.
  - Agregar endpoint admin de prueba.
  - Mantener `send: true` como requisito para envio real.
  - Done: payload dry-run probado localmente.

- [ ] Automatizar uso de plantillas dentro de flujos reales.
  - Agregar proteccion para no enviar marketing sin consentimiento/opt-out.
  - Conectar `order_confirmation_rav`, `payment_instructions_rav` y `post_sale_review_rav` al flujo cuando Meta las apruebe.
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
