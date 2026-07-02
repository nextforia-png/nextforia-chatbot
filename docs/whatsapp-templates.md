# Plantillas WhatsApp RAV Toys

Catalogo inicial de plantillas para solicitar aprobacion en WhatsApp Manager. Meta clasifica plantillas principalmente como `UTILITY`, `MARKETING` o `AUTHENTICATION`; para RAV empezamos con `UTILITY` para mensajes transaccionales y `MARKETING` solo cuando hay reactivacion, carrito abandonado o recomendacion comercial.

## Reglas de aprobacion

- No mezclar promociones dentro de plantillas `UTILITY`.
- Usar variables con ejemplos reales y seguros.
- Mantener textos breves, claros y relacionados con una accion previa del cliente.
- Evitar lenguaje de urgencia falsa, claims absolutos o promesas que no podamos cumplir.
- Incluir opt-out en plantillas `MARKETING`.
- Crear primero las plantillas prioritarias y probarlas con el numero de RAV antes de automatizar envios.

Referencias oficiales:

- Template fundamentals: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview
- Template components: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/components/
- Template categorization: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization
- Utility templates: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/utility-templates/utility-templates/

## Prioridad 1

### order_confirmation_rav

Categoria: `UTILITY`
Idioma: `es_CO`
Objetivo: confirmar que recibimos la solicitud de pedido.

Body:

```text
Hola {{1}}, recibimos tu pedido de RAV Toys por {{2}}.

Producto: {{3}}
Total: {{4}}

Una asesora revisara los datos y te confirmara el siguiente paso por este chat.
```

Variables de ejemplo:

| Variable | Ejemplo |
|---|---|
| `{{1}}` | Maria |
| `{{2}}` | WhatsApp |
| `{{3}}` | LOOKY LOOKY Juguete Sensorial |
| `{{4}}` | $79.950 COP |

Botones sugeridos:

- Quick reply: `Hablar con asesora`
- Quick reply: `Ver mas juguetes`

Notas: no incluir descuentos ni recomendaciones en esta plantilla para mantenerla como `UTILITY`.

### payment_instructions_rav

Categoria: `UTILITY`
Idioma: `es_CO`
Objetivo: reenviar instrucciones de pago cuando el cliente ya inicio pedido.

Body:

```text
Hola {{1}}, aqui tienes la informacion para continuar con tu pedido en RAV Toys:

Pedido: {{2}}
Total: {{3}}
Medio de pago elegido: {{4}}

Cuando realices el pago, responde a este chat con el comprobante para ayudarte a confirmar.
```

Variables de ejemplo:

| Variable | Ejemplo |
|---|---|
| `{{1}}` | Laura |
| `{{2}}` | Bloques magneticos |
| `{{3}}` | $129.900 COP |
| `{{4}}` | transferencia |

Botones sugeridos:

- Quick reply: `Ya pague`
- Quick reply: `Necesito ayuda`

### shipping_update_rav

Categoria: `UTILITY`
Idioma: `es_CO`
Objetivo: actualizar estado de entrega o despacho.

Body:

```text
Hola {{1}}, tenemos una actualizacion de tu pedido RAV Toys:

Estado: {{2}}
Referencia: {{3}}

Si necesitas cambiar algun dato de entrega, responde a este mensaje y una asesora te ayuda.
```

Variables de ejemplo:

| Variable | Ejemplo |
|---|---|
| `{{1}}` | Andres |
| `{{2}}` | en preparacion |
| `{{3}}` | pedido 1048 |

Botones sugeridos:

- Quick reply: `Hablar con asesora`

### warranty_case_received_rav

Categoria: `UTILITY`
Idioma: `es_CO`
Objetivo: confirmar recepcion de una solicitud de garantia.

Body:

```text
Hola {{1}}, recibimos tu solicitud de garantia en RAV Toys.

Caso: {{2}}
Producto: {{3}}

Nuestro equipo revisara la informacion y te respondera por este mismo chat.
```

Variables de ejemplo:

| Variable | Ejemplo |
|---|---|
| `{{1}}` | Carolina |
| `{{2}}` | garantia por pieza faltante |
| `{{3}}` | Carro montable |

Botones sugeridos:

- Quick reply: `Enviar foto`
- Quick reply: `Hablar con asesora`

### human_followup_rav

Categoria: `MARKETING`
Idioma: `es_CO`
Objetivo: retomar un chat donde el cliente pidio asesora o quedo en control humano.

Body:

```text
Hola {{1}}, soy {{2}} de RAV Toys.

Estoy retomando tu conversacion sobre {{3}}. Puedes responder por aqui y te ayudo.
```

Variables de ejemplo:

| Variable | Ejemplo |
|---|---|
| `{{1}}` | Daniela |
| `{{2}}` | Eliana |
| `{{3}}` | el pedido del juguete sensorial |

Botones sugeridos:

- Quick reply: `Continuar`
- Quick reply: `Ya no necesito`

Notas: originalmente se intento como `UTILITY`, pero Meta la reclasifico como `MARKETING` al cargarla en WhatsApp Manager el 2026-07-02. Usarla solo con contexto claro del cliente y controles de consentimiento/opt-out cuando se automatice.

## Prioridad 2

### abandoned_cart_rav

Categoria: `MARKETING`
Idioma: `es_CO`
Objetivo: recuperar un carrito iniciado y no finalizado.

Body:

```text
Hola {{1}}, vimos que dejaste pendiente tu pedido en RAV Toys:

{{2}}

Si aun te interesa, podemos ayudarte a finalizarlo por este chat.
```

Footer:

```text
Responde STOP si no quieres recibir estos mensajes.
```

Variables de ejemplo:

| Variable | Ejemplo |
|---|---|
| `{{1}}` | Sofia |
| `{{2}}` | LOOKY LOOKY Juguete Sensorial |

Botones sugeridos:

- Quick reply: `Finalizar pedido`
- Quick reply: `Ver alternativas`
- Quick reply: `STOP`

Notas: carrito abandonado se debe tratar como `MARKETING` porque busca reactivar una compra.

### product_recommendation_rav

Categoria: `MARKETING`
Idioma: `es_CO`
Objetivo: enviar recomendacion solicitada o segmentada de productos.

Body:

```text
Hola {{1}}, tenemos una recomendacion de RAV Toys para {{2}}:

{{3}}

Si quieres, una asesora te ayuda a elegir la mejor opcion.
```

Footer:

```text
Responde STOP si no quieres recibir recomendaciones.
```

Variables de ejemplo:

| Variable | Ejemplo |
|---|---|
| `{{1}}` | Valentina |
| `{{2}}` | ninos de 3 a 5 anos |
| `{{3}}` | juguetes sensoriales y bloques magneticos |

Botones sugeridos:

- Quick reply: `Ver opciones`
- Quick reply: `Hablar con asesora`
- Quick reply: `STOP`

### back_in_stock_rav

Categoria: `MARKETING`
Idioma: `es_CO`
Objetivo: avisar disponibilidad de un producto por el que el cliente pregunto.

Body:

```text
Hola {{1}}, el producto que consultaste en RAV Toys ya esta disponible:

{{2}}

Podemos ayudarte a separarlo o resolver dudas por este chat.
```

Footer:

```text
Responde STOP si no quieres recibir avisos.
```

Variables de ejemplo:

| Variable | Ejemplo |
|---|---|
| `{{1}}` | Natalia |
| `{{2}}` | Carro montable azul |

Botones sugeridos:

- Quick reply: `Separar producto`
- Quick reply: `Preguntar disponibilidad`
- Quick reply: `STOP`

### post_sale_review_rav

Categoria: `UTILITY`
Idioma: `es_CO`
Objetivo: pedir calificacion despues de una compra o atencion finalizada.

Body:

```text
Hola {{1}}, gracias por comprar en RAV Toys.

Tu opinion nos ayuda a mejorar. Como calificarias tu experiencia del 1 al 5?
```

Variables de ejemplo:

| Variable | Ejemplo |
|---|---|
| `{{1}}` | Camila |

Botones sugeridos:

- Quick reply: `5`
- Quick reply: `4`
- Quick reply: `Necesito ayuda`

Notas: usar despues de una compra, garantia o handoff finalizado.

## Orden recomendado de carga en Meta

1. `order_confirmation_rav`
2. `payment_instructions_rav`
3. `shipping_update_rav`
4. `human_followup_rav`
5. `warranty_case_received_rav`
6. `post_sale_review_rav`
7. `abandoned_cart_rav`
8. `back_in_stock_rav`
9. `product_recommendation_rav`

## Siguiente paso tecnico

Ya existe un registro local en `whatsapp-templates.js` y endpoints admin para probar payloads:

```bash
curl "https://rav-whatsapp-bot.onrender.com/admin/templates?key=TU_DASHBOARD_KEY"
```

Dry run, no envia WhatsApp:

```bash
curl -X POST "https://rav-whatsapp-bot.onrender.com/admin/template-test?key=TU_DASHBOARD_KEY" \
  -H "content-type: application/json" \
  -d '{
    "templateName": "order_confirmation_rav",
    "params": {
      "customer_name": "Maria",
      "channel": "WhatsApp",
      "product": "LOOKY LOOKY Juguete Sensorial",
      "total": "$79.950 COP"
    }
  }'
```

Envio real solo despues de que Meta apruebe la plantilla:

```bash
curl -X POST "https://rav-whatsapp-bot.onrender.com/admin/template-test?key=TU_DASHBOARD_KEY" \
  -H "content-type: application/json" \
  -d '{
    "send": true,
    "userId": "573001112233",
    "templateName": "order_confirmation_rav",
    "params": {
      "customer_name": "Maria",
      "channel": "WhatsApp",
      "product": "LOOKY LOOKY Juguete Sensorial",
      "total": "$79.950 COP"
    }
  }'
```

Pendiente despues de aprobacion:

- Confirmar nombres exactos en WhatsApp Manager.
- Probar una plantilla `UTILITY` con el numero de RAV.
- Probar una plantilla `MARKETING` solo con opt-out claro y consentimiento.
