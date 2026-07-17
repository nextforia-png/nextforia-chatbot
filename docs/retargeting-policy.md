# Politica de retargeting de NextforIA

Fecha: 17 de julio de 2026

Estado: politica y configuracion del Customer Panel preparadas. El programador de envios
debe permanecer apagado hasta completar pruebas, consentimiento y validacion de plantillas.

## Objetivo

Retomar oportunidades comerciales con mensajes utiles y esperados, sin presionar al
cliente ni convertir WhatsApp en un canal de spam. La automatizacion debe ayudar a cerrar
una compra, recuperar un carrito o acompañar una postventa con contexto verificable.

## Modos

| Modo | Comportamiento |
|---|---|
| `disabled` | No crea ni envia seguimientos. Es el valor inicial. |
| `simulation` | Calcula elegibilidad y registra lo que habria enviado, sin contactar al cliente. |
| `manual` | Crea una cola y exige aprobacion humana antes de cada envio. |
| `automatic` | Envia solo si todas las reglas, plantillas y verificaciones tecnicas estan listas. |

El Customer Panel no debe permitir seleccionar `automatic` hasta que el servicio de
programacion, la cancelacion y el estado de plantillas hayan sido validados en produccion.

## Secuencias predeterminadas

| Evento | Espera | Accion |
|---|---:|---|
| Intencion alta sin respuesta | 3 horas | Seguimiento contextual dentro de la ventana permitida. |
| Carrito iniciado sin compra | 24 horas | Plantilla aprobada `abandoned_cart_rav`. |
| Compra confirmada | 3 dias | Plantilla aprobada `post_sale_review_rav`. |
| Producto nuevamente disponible | Por evento | `back_in_stock_rav`, solo si el cliente lo solicito y autorizo. |
| Recomendacion futura | Segun campana | `product_recommendation_rav`, con consentimiento especifico. |

Solo se permiten dos mensajes de marketing por cliente en cualquier periodo movil de
siete dias. El seguimiento de 24 horas no se envia si el limite ya fue alcanzado.

## Elegibilidad obligatoria

Un seguimiento comercial solo puede entrar a la cola cuando:

- El cliente dio consentimiento verificable para esa categoria de mensajes.
- Existe una señal comercial fuerte, carrito, solicitud de disponibilidad o compra confirmada.
- La plantilla requerida aparece aprobada y activa para el tenant y el idioma.
- El numero y el canal pertenecen al mismo tenant.
- La hora de envio cae entre 09:00 y 19:00 en `America/Bogota`.

Fuera de las 24 horas posteriores al ultimo mensaje del cliente se debe usar una plantilla
aprobada. Dentro de la ventana de 24 horas tambien se exige consentimiento para cualquier
seguimiento comercial programado.

## Cancelacion inmediata

Todo trabajo pendiente se cancela si ocurre cualquiera de estos eventos:

- El cliente responde.
- Shopify confirma la compra o el pago.
- Un agente toma control de la conversacion.
- El cliente escribe `STOP`, `SALIR`, `NO MAS`, `CANCELAR` o una expresion equivalente.
- El consentimiento vence, se revoca o no puede demostrarse.
- La plantilla se pausa, rechaza o pierde calidad suficiente para el envio.

Una baja de consentimiento se aplica antes de generar nuevas colas y nunca se revierte
automaticamente.

## Contenido y personalizacion

- Usar nombre y producto solo cuando provengan de memoria permitida o de una compra validada.
- No afirmar escasez, descuento, reserva o disponibilidad sin una fuente vigente.
- No incluir cedula, direccion, datos de pago ni identificadores sensibles.
- Cada mensaje debe explicar por que se retoma la conversacion y ofrecer una salida clara.
- No encadenar mensajes si el cliente no respondio al limite permitido.

## Auditoria y control

Cada decision debe registrar `tenant_id`, cliente, evento origen, consentimiento, plantilla,
hora programada, estado, motivo de envio o bloqueo y actor que aprobo. El Customer Panel
debe mostrar cola pendiente, enviados, cancelados y bloqueados, y permitir pausar el modulo.

Referencias oficiales:

- WhatsApp Business Messaging Policy: https://whatsappbusiness.com/policy/
- Plantillas: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview
- Categorizacion: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization
