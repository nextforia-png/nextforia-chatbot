# Operación segura del retargeting

El programador usa eventos append-only en `conversation_logs`, separados por `tenant_id` mediante el identificador `retargeting-events:<tenant>`. En producción, Supabase es obligatorio: si no está configurado, el módulo falla cerrado y no acepta una cola solo en memoria.

## Worker / cron

El entrypoint para un cron externo es:

```bash
BOT_BASE_URL=https://tu-bot.example.com \
DASHBOARD_KEY=... \
RETARGETING_TENANT_IDS=tenant-a,tenant-b \
npm run retargeting:worker
```

El worker es idempotente, procesa únicamente decisiones vencidas y comprueba que `real_sends_enabled` y `automatic_mode_enabled` sigan en `false`. Termina con error si cualquiera de esas garantías cambia o si el servidor reporta un envío real.

No hay ningún cron de producción habilitado en este repositorio. Antes de programarlo se debe:

1. Ejecutar `npm run test:retargeting` en CI y staging.
2. Confirmar Supabase y aislamiento de tenants.
3. Validar plantillas, consentimiento y cancelaciones con eventos reales de prueba.
4. Mantener el módulo en `simulation` o `manual`.

Superar las pruebas no habilita automáticamente los envíos. La constante de envío real y la compuerta del modo automático permanecen bloqueadas y requieren un cambio de código deliberado posterior a la aprobación operativa.

## Controles del Customer Panel

La pestaña **Seguimientos** muestra cola, historial, bloqueos, política y pausa global. Los administradores pueden aprobar una decisión o cancelarla; aprobar no envía el mensaje. Las respuestas del cliente, compra confirmada, handoff, STOP, revocación de consentimiento y degradación de plantilla cancelan cualquier decisión abierta.
