# Customer Panel Staging v364

## Alcance

- Corrige el bloqueo de scroll en Conversaciones para escritorio.
- La lista de conversaciones, el historial del chat y el perfil del cliente se desplazan de forma independiente.
- Encabezados, filtros, composer y controles de handoff permanecen visibles dentro de su columna.
- No cambia endpoints, autenticación, aislamiento de tenant ni acciones del bot.
- La navegación móvil conserva una sola vista a la vez (bandeja o conversación), sin overflow horizontal.

## Feature gate

El cambio visual solo aplica con `CUSTOMER_PANEL_REDESIGN_V1_ENABLED`. El panel legado permanece intacto con el gate apagado.

## Versión

`v364-staging-conversation-independent-scroll`
