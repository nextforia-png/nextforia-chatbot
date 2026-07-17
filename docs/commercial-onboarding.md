# Onboarding comercial NexforIA Bots

Objetivo: que un comercio nuevo pueda pasar de interes comercial a bot operativo sin depender de improvisacion tecnica.

## Flujo recomendado

1. Calificacion inicial
   - Vertical del comercio y tipo de venta.
   - Volumen aproximado de chats diarios.
   - Canal actual: WhatsApp Business App, Cloud API, Instagram, webchat u otro.
   - Plataforma de catalogo/pedidos: Shopify, WooCommerce, archivo, POS u otra.
   - Persona responsable de intervenir chats humanos.

2. Paquete de accesos
   - Meta Business Manager con administrador disponible.
   - WhatsApp Business Account existente o autorizacion para crear uno.
   - Numero telefonico que se conectara al bot.
   - Acceso al ecommerce o fuente de catalogo/pedidos.
   - Politica de privacidad publica.
   - Logo, nombre visible y datos legales del negocio.

3. Configuracion tecnica
   - Crear tenant del cliente.
   - Configurar `phone_number_id`, WABA ID y token del cliente.
   - Configurar catalogo y pedidos.
   - Crear usuarios del dashboard: `super_admin` para NexforIA; `admin`, `agent`, `viewer` para el cliente.
   - Configurar alertas internas del cliente.
   - Cargar plantillas WhatsApp iniciales.

4. Prueba controlada
   - Mensaje entrante real.
   - Busqueda de producto real.
   - Handoff humano desde dashboard.
   - Devolucion al bot.
   - Estado de pedido si aplica.
   - Alerta operativa manual.

5. Salida a produccion
   - Acordar horario de soporte humano.
   - Definir guiones de intervencion.
   - Activar monitoreo.
   - Medir la primera semana: chats, handoffs, ventas iniciadas, errores y oportunidades de catalogo.

## Estados de onboarding

- `lead`: comercio interesado, sin acceso tecnico.
- `qualified`: negocio y caso de uso validados.
- `access_pending`: faltan accesos del cliente.
- `meta_pending`: esperando numero, nombre visible, plantillas o revision Meta.
- `technical_setup`: configurando bot, dashboard y ecommerce.
- `pilot`: pruebas con equipo interno del cliente.
- `live`: bot activo con clientes reales.
- `paused`: pausado por decision comercial, tecnica o de Meta.

## Informacion minima por cliente

```json
{
  "tenant_id": "rav-toys",
  "brand_name": "RAV Toys",
  "business_manager_id": "102036837666765",
  "waba_id": "",
  "phone_number_id": "",
  "display_phone": "",
  "shopify_store_domain": "ravtoys.myshopify.com",
  "privacy_policy_url": "",
  "platform_users": [
    { "username": "nexforia", "role": "super_admin" }
  ],
  "dashboard_users": [
    { "username": "admin", "role": "admin" },
    { "username": "asesora", "role": "agent" },
    { "username": "visor", "role": "viewer" }
  ],
  "notification_phones": ["57XXXXXXXXXX"]
}
```

## Lo que debemos vender como promesa

- Atencion 24/7 para preguntas frecuentes, productos, envios, garantias y estado de pedidos.
- Control humano desde dashboard cuando el bot no debe continuar solo.
- Integracion con catalogo y pedidos del comercio.
- Alertas operativas para no dejar chats pendientes.
- Reportes de oportunidades: productos buscados sin resultado, handoffs y motivos de contacto.

## Lo que no debemos prometer todavia

- Activacion instantanea sin depender de Meta.
- Uso del mismo numero en todos los escenarios sin revisar compatibilidad.
- Plantillas marketing aprobadas automaticamente.
- Escalamiento ilimitado de mensajes desde el primer dia.
