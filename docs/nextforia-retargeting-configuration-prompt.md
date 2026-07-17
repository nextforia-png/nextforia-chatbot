# Prompt para NextforIA Configuration

Implementa el programador multi-tenant de retargeting de NextforIA usando como contrato
`docs/retargeting-policy.md` y `answers.retargeting` de `bot-setup.js`.

Requisitos:

- Crear una cola persistente e idempotente con estados `scheduled`, `approval_required`,
  `sent`, `cancelled`, `blocked` y `failed`.
- Evaluar alta intencion a 3 h, carrito a 24 h, postcompra a 3 dias y eventos de inventario.
- Exigir opt-in demostrable, plantilla aprobada fuera de 24 h, ventana 09:00-19:00
  `America/Bogota` y maximo 2 mensajes de marketing por 7 dias.
- Cancelar ante respuesta, compra/pago, handoff u opt-out; `STOP` debe bloquear futuros envios.
- `simulation` nunca transmite; `manual` requiere aprobacion; `automatic` debe permanecer
  bloqueado hasta que plantillas, cron, cancelacion y pruebas end-to-end esten listos.
- Integrar en Customer Panel una vista de cola, historial, motivos de bloqueo, pausa global y
  aprobacion/cancelacion manual, aislada por `tenant_id` y sin exponer tokens.
- Agregar pruebas de idempotencia, limites, horario, consentimiento, opt-out y cancelaciones.

No modifiques los flujos actuales de conversacion ni envies mensajes reales durante la
implementacion. Entrega migracion, endpoints, worker/cron, pruebas y checklist de activacion.
