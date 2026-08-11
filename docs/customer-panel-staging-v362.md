# Customer Panel Staging v362

## Alcance

- La gráfica **Clientes atendidos por día** muestra el valor junto a cada punto en escritorio y móvil.
- Las tarjetas **Ventas asistidas**, **Clientes atendidos**, **Resueltas por el bot** y **Cierres por confirmar** abren la bandeja con el filtro correspondiente.
- **Tiempo de respuesta** y **Resumen IA** permanecen informativos y no navegan.
- La navegación usa las señales reales ya presentes en cada conversación (`business_signals`, estado, etiquetas y etapa de compra); no crea métricas ni conversaciones simuladas en el panel autenticado.
- La personalización del Resumen sigue funcionando: al activar **Personalizar**, las tarjetas se arrastran u ocultan sin abrir una conversación.

## Seguridad y compatibilidad

- Sin cambios en autenticación, derivación de `tenant_id`, contratos API, conexiones de canales ni backend del bot.
- Despliegue autorizado únicamente en Staging.
- Producción permanece sin cambios.
