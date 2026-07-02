# Playbook comercial RAV Toys

Guia operativa para responder chats cuando el bot entrega una conversacion a una asesora humana.

## Principios de atencion

- Responder como RAV Toys: calido, claro, breve y orientado a cerrar el siguiente paso.
- No prometer disponibilidad, envio same-day o aprobacion de credito sin confirmarlo.
- No competir con el bot: si el chat esta en humano, la asesora decide el siguiente paso y luego devuelve al bot cuando la conversacion queda cerrada.
- Mantener datos sensibles dentro del chat y del panel. No copiar informacion de clientes a herramientas externas innecesarias.
- Si hay duda operativa, tomar control humano antes de responder.

## Estados del chat

### Bot activo

El bot responde automaticamente. La asesora puede revisar, pero solo interviene si:

- El cliente pide una persona.
- Hay pago, comprobante, contraentrega, Addi o Su Pay.
- Hay garantia, foto, reclamo o caso sensible.
- Hay envio Medellin same-day por confirmar.
- El bot dio una respuesta insuficiente o el cliente esta confundido.

### Humano activo

El bot queda pausado para ese cliente. La asesora debe:

- Leer los ultimos mensajes.
- Identificar el objetivo: venta, pago, envio, garantia, duda o seguimiento.
- Responder desde el panel o desde WhatsApp Business.
- Mantener el control hasta que no quede una pregunta abierta.

### Pendiente

Un chat queda pendiente cuando el cliente escribio despues de la ultima respuesta humana. Prioridad:

1. Pago o comprobante.
2. Garantia o reclamo.
3. Compra lista para cerrar.
4. Envio Medellin o cambio de datos de entrega.
5. Preguntas generales.

## Tomar control

Tomar control cuando una humana va a responder o revisar activamente el caso.

Mensaje sugerido:

```text
Hola, soy [NOMBRE] de RAV Toys. Ya estoy revisando tu caso y te ayudo por aqui.
```

Si el cliente venia de una venta:

```text
Hola, soy [NOMBRE] de RAV Toys. Ya veo el pedido y te ayudo a dejarlo listo.
```

Si el cliente venia de garantia:

```text
Hola, soy [NOMBRE] de RAV Toys. Ya tengo tu solicitud de garantia y voy a revisar la informacion para ayudarte.
```

## Devolver al bot

Devolver al bot solo cuando:

- El cliente ya recibio respuesta clara.
- No hay pago, garantia ni despacho pendiente de una humana.
- El cliente no tiene una pregunta abierta.
- La asesora dejo un cierre amable.

Mensaje antes de devolver:

```text
Listo, queda todo claro por ahora. Si necesitas algo mas, puedes escribirnos por aqui y seguimos atentos.
```

Al devolver el control, el bot puede pedir calificacion de atencion.

## Flujo de venta

### 1. Confirmar producto

Si el cliente ya eligio producto:

```text
Perfecto, te confirmo el producto: [PRODUCTO]. El total es [TOTAL]. Para continuar necesito tus datos de envio.
```

Si falta confirmar producto:

```text
Claro. Para ayudarte bien, confirmame cual juguete quieres o enviame el link/producto que viste.
```

### 2. Pedir datos

Pedir y validar:

- Nombre completo.
- Cedula.
- Direccion completa con ciudad.
- Telefono de contacto.
- Metodo de pago.

Script:

```text
Para dejar tu pedido listo, por favor enviame:

Nombre completo:
Cedula:
Direccion y ciudad:
Telefono:
Metodo de pago:
```

### 3. Cerrar metodo de pago

Usar el metodo elegido por el cliente. Si el bot ya envio instrucciones, no repetir todo; confirmar el siguiente paso.

## Pagos

### Wompi

Usar cuando el cliente quiere tarjeta debito o credito.

```text
Puedes pagar con tarjeta por Wompi en este link:
https://checkout.wompi.co/l/iGnSPs

Por favor ingresa el valor exacto: [TOTAL].
Cuando termines, envianos la confirmacion por aqui.
```

### Transferencia Bancolombia

```text
Puedes transferir a Bancolombia:

Cuenta de ahorros: 37 938 445 851
Titular: RAV Kids SAS
NIT: 900 822 164-1
Valor: [TOTAL]

Cuando tengas el comprobante, enviamelo por aqui para confirmar tu pedido.
```

### Contraentrega

Disponible para compras menores a $1.450.000 y pago en efectivo.

```text
Podemos manejar pago contraentrega en efectivo por [TOTAL].

Te confirmo datos de envio y disponibilidad para dejarlo programado.
```

Si supera el monto o no aplica:

```text
Para este pedido no puedo dejar contraentrega. Podemos hacerlo por Wompi, transferencia, Addi o Su Pay.
```

### Addi o Su Pay

Sujeto a aprobacion. Debe continuar una asesora.

```text
Podemos revisar credito con [ADDI/SU PAY]. Esta sujeto a aprobacion de la entidad.

Te acompano con el proceso y te confirmo el link o paso siguiente.
```

## Envios

Reglas base:

- Envio nacional: $15.000.
- Envio gratis desde $199.000.
- Tiempo nacional estimado: 2 a 5 dias habiles segun ciudad y transportadora.
- Transportadoras: Envia, Coordinadora, Servientrega, TCC e Interrapidisimo.
- Medellin: muchas veces se puede entregar el mismo dia, pero se confirma caso a caso.

Script nacional:

```text
Hacemos envios a toda Colombia. El envio cuesta $15.000 y es gratis desde $199.000. El tiempo estimado es de 2 a 5 dias habiles, segun la ciudad.
```

Script Medellin:

```text
Si estas en Medellin, reviso si podemos entregarte hoy. Confirmame barrio, direccion y hora aproximada en la que puedes recibir.
```

## Garantias

Politica base:

- 30 dias calendario desde la compra.
- Aplica por defecto de fabrica, idoneidad o calidad.
- Cambio de opinion: hasta 5 dias habiles, producto sin uso y en empaque original.
- No se hace devolucion de dinero; se entrega bono por el mismo valor con vigencia de 1 ano.
- Transporte hacia RAV corre por cuenta del cliente.

Datos requeridos:

- Factura o numero de pedido.
- Cedula o NIT.
- Fecha de compra.
- Motivo de la solicitud.
- Fotos o video si aplica.

Script inicial:

```text
Claro, te ayudo con la garantia. Para revisar el caso necesito:

Factura o numero de pedido:
Cedula o NIT:
Fecha de compra:
Que ocurrio con el producto:

Si tienes foto o video, tambien puedes enviarlo por aqui.
```

Script de recepcion:

```text
Gracias. Ya tengo la informacion inicial. Vamos a revisar el caso con el equipo y te confirmamos el siguiente paso por este chat.
```

## Objeciones frecuentes

### "Esta muy caro"

```text
Te entiendo. Este producto esta pensado para [BENEFICIO]. Si quieres, tambien puedo mostrarte opciones similares en otro presupuesto.
```

### "Lo consigo mas barato"

```text
Puede pasar. En RAV Toys te acompanamos con asesoria, garantia y compra segura. Si me dices tu presupuesto, busco la mejor opcion disponible.
```

### "Me da miedo pagar antes"

```text
Entiendo la duda. Puedes pagar por Wompi, transferencia a RAV Kids SAS o revisar contraentrega si aplica para tu pedido. Te acompano hasta dejarlo confirmado.
```

### "Llega hoy?"

```text
Depende de direccion, hora y disponibilidad de despacho. Si estas en Medellin, confirmame barrio y producto para revisar si alcanza para entrega hoy.
```

### "Necesito regalo para cierta edad"

```text
Claro. Dime la edad, presupuesto aproximado y si buscas algo educativo, sensorial, creativo o de movimiento. Con eso te recomiendo mejores opciones.
```

## Cierre de venta

Cuando el cliente confirma pago o metodo manual:

```text
Perfecto, ya dejo tu pedido reportado para validacion y despacho. Te confirmamos por este chat el siguiente paso.
```

Si falta comprobante:

```text
Quedo pendiente del comprobante para confirmar el pedido y avanzar con el despacho.
```

Si ya no compra:

```text
No hay problema. Si quieres retomarlo despues o comparar opciones, puedes escribirnos por aqui.
```

## Checklist antes de cerrar un chat humano

- El cliente recibio respuesta a su ultima pregunta.
- Si hay compra, estan producto, total, datos y metodo de pago.
- Si hay garantia, estan los datos minimos o se explico que falta.
- Si hay envio Medellin, se confirmo direccion/barrio y siguiente paso.
- Si la humana debe seguir pendiente, no devolver al bot.
- Si el caso quedo resuelto, enviar cierre y devolver al bot.

