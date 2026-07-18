# Setup de clientes piloto

Alcance inicial: RAV Toys y hasta tres comercios similares, cada uno en un entorno aislado y usando la misma base de codigo.

## Modelo del piloto

- Un servicio de aplicacion por cliente.
- Un proyecto o esquema de Supabase por cliente.
- Credenciales de Meta, ecommerce y notificaciones propias.
- El cliente conserva la propiedad de su Business Portfolio, WABA, numero y aplicacion de Meta.
- NexforIA conserva el codigo y opera la configuracion, integraciones, monitoreo y soporte.

## Requisitos del cliente

- Administrador disponible en Meta Business Portfolio.
- WABA y numero nuevo o escenario del numero actual revisado previamente.
- Sitio web y politica de privacidad publica.
- Catalogo estructurado; Shopify es la opcion preferida para los primeros pilotos.
- Acceso tecnico al catalogo y pedidos.
- Una persona responsable de handoffs y un horario de atencion.
- Datos legales, logo, nombre visible y reglas del negocio.

## Alta tecnica

1. Completar `/admin/client-onboarding` junto al responsable del comercio.
2. Crear el tenant y asignar `DEFAULT_TENANT_ID`, `TENANT_BRAND_NAME` y `TENANT_CUSTOMER_NUMBER`.
3. Crear servicio, base de datos, secretos y dominio separados.
4. Configurar Meta, Shopify, IA, usuarios del panel y notificaciones.
5. Aplicar `docs/supabase-multi-tenant-phase-a.sql` y luego activar `SUPABASE_TENANT_COLUMNS_ENABLED=1`.
6. Publicar la configuracion del negocio desde el asistente de setup.
7. Ejecutar pruebas de mensaje, producto, pedido, handoff, plantilla y alerta.
8. Mantener un piloto controlado de 7 a 14 dias antes de declarar el cliente `live`.

## Dominios previstos

- `www.nextforia.com`: sitio comercial.
- `app.nextforia.com`: panel y acceso de clientes.
- `api.nextforia.com`: webhooks y API.

Mientras el dominio se configura, cada piloto puede usar temporalmente la URL segura de su servicio.

## Regla de salida

Ningun cliente pasa a produccion si puede ver conversaciones, usuarios, metricas, configuracion o credenciales de otro comercio.
