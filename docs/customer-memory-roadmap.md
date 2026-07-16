# Memoria del cliente

Esta fase futura permitirá que el bot reconozca a clientes recurrentes y use contexto
útil sin sonar invasivo. No forma parte de los estados de conversación de `v66`.

## Información que podrá recordar

- Nombre preferido y canal de contacto.
- Compras confirmadas desde Shopify: producto, fecha y estado del pedido.
- Gustos expresados por el propio cliente: categorías, personajes, presupuesto y tipo de regalo.
- Recomendaciones anteriores y respuesta del cliente.
- Casos de garantía o servicio que conviene no volver a preguntar desde cero.

## Experiencia esperada

El bot podrá preguntar de forma natural, por ejemplo:

- “¿Cómo les fue con el Lego que compraste la vez pasada?”
- “¿Esta vez también buscas un regalo para cinco años o tienes otra edad en mente?”
- “La última vez te gustaron los carros a control remoto. ¿Quieres que empecemos por ahí?”

Siempre debe distinguir entre información confirmada y una preferencia inferida. No debe
presentar inferencias como hechos ni repetir datos personales innecesariamente.

## Implementación por fases

1. Perfil persistente por cliente y tenant.
2. Historial de compras confirmado desde Shopify.
3. Preferencias extraídas de conversaciones, visibles y editables por el equipo.
4. Recomendaciones personalizadas con explicación del contexto usado.
5. Controles para corregir u olvidar recuerdos y definir retención.

WhatsApp e Instagram permanecerán como identidades separadas hasta que el cliente las
vincule explícitamente; no se deben unir perfiles solo por similitud de nombre.
