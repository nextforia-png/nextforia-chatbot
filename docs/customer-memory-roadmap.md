# Memoria comercial del cliente

La primera fase está implementada en `v72-adaptive-memory`. El bot reconoce señales
comerciales fuertes, conserva contexto permitido por cliente y amplía su presupuesto de
respuesta cuando la oportunidad necesita más profundidad.

## Primera fase activa

- Tres niveles de atención: `standard`, `engaged` y `high`.
- Escalamiento por intención explícita de compra, checkout activo, etapa comercial o
  condición de cliente recurrente.
- Memoria persistente en Supabase, separada por identidad de cada canal.
- Nombre preferido únicamente cuando el cliente lo expresa o lo entrega durante checkout.
- Productos de interés, etapa comercial y números de pedidos verificados.
- Prioridad e intereses visibles en el Panel de Control.
- Saludo natural por nombre al comenzar una sesión nueva, sin repetirlo en cada mensaje.

Una consulta casual no crea memoria. Las consultas de precio, disponibilidad o envío
pueden recibir más contexto durante ese turno, pero la memoria persistente solo empieza
con intención fuerte o con un hito real del flujo de compra.

## Información permitida

- Nombre preferido y canal de contacto.
- Productos elegidos o consultados dentro de un proceso de compra.
- Etapa alcanzada: interés, checkout, pago, entrega al equipo o compra verificada.
- Número y fecha de pedidos cuya identidad fue validada contra Shopify.

No se guardan en esta memoria cédula, dirección, datos de pago ni otros campos sensibles
del checkout. Los datos operativos necesarios siguen su flujo actual y no se convierten
en recuerdos usados para personalizar respuestas.

## Experiencia esperada

El bot puede responder de forma natural, por ejemplo:

- “¿Cómo les fue con el Lego que compraste la vez pasada?”
- “¿Esta vez también buscas un regalo para cinco años o tienes otra edad en mente?”
- “La última vez te gustaron los carros a control remoto. ¿Quieres que empecemos por ahí?”

Siempre debe distinguir entre información confirmada y una preferencia inferida. No debe
presentar inferencias como hechos ni repetir datos personales innecesariamente.

## Próximas fases

1. Confirmar compras automáticamente mediante webhooks de pedidos pagados de Shopify.
2. Aislar perfiles y reglas de retención por `tenant_id` antes de comercializar.
3. Permitir que el equipo corrija u olvide recuerdos desde el panel.
4. Ampliar preferencias explícitas a edad, ocasión y presupuesto con controles visibles.
5. Medir conversión y costo por nivel para afinar los umbrales adaptativos.

WhatsApp e Instagram permanecerán como identidades separadas hasta que el cliente las
vincule explícitamente; no se deben unir perfiles solo por similitud de nombre.
