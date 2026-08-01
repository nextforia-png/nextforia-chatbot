# Multimodal Input Agent

Estado: piloto controlado de produccion para los bots actuales de Atencion al cliente y Agendamiento. Cerrado por defecto para cualquier otro tenant.

## Objetivo

Procesar audio e imagen en el bot real de WhatsApp. El agente vive en el mismo
proyecto, usa el mismo webhook y pasa resultados al flujo normal de conversacion
solo cuando el tenant esta autorizado por feature flags.

## Capacidades v1

- Nota de voz entrante:
  - descarga media desde Meta;
  - transcribe con proveedor configurado;
  - envia la transcripcion al bot como `[AGENTE MULTIMODAL: NOTA DE VOZ TRANSCRITA]`.
- Imagen entrante:
  - descarga media desde Meta;
  - analiza visualmente con proveedor configurado;
  - envia hallazgos al bot como `[AGENTE MULTIMODAL: IMAGEN ANALIZADA]`.
- Fallback seguro:
  - si falla audio o imagen, responde pidiendo texto/descripcion o escalamiento humano.
- Feature flags por tenant:
  - `MULTIMODAL_AGENT_ENABLED`
  - `MULTIMODAL_AGENT_TENANT_IDS`
  - `MULTIMODAL_VOICE_INPUT_ENABLED`
  - `MULTIMODAL_IMAGE_INPUT_ENABLED`
  - `MULTIMODAL_VOICE_REPLIES_ENABLED`

## Siguiente etapa

1. Probar con RAV y DERCO usando mensajes reales de WhatsApp.
2. Registrar metricas de costo: audios, imagenes, errores y handoffs.
3. Agregar toggles visibles en Customer Panel.
4. Implementar respuestas de voz con ElevenLabs y envio de audio por WhatsApp.
5. Convertirlo en modulo comercial para otros tenants solo despues de pruebas y aprobacion.

## Politica de activacion

No activar publicamente para todos los clientes. Primero:

- `MULTIMODAL_AGENT_ENABLED=1`
- `MULTIMODAL_AGENT_TENANT_IDS=rav-toys,rav-toys-adac1e,grupo-derco`
- activar audio e imagen solo para RAV (Atencion al cliente) y DERCO (Agendamiento) durante el piloto;
- confirmar panel, logs, latencia y fallback;
- aprobar en Super Admin antes de abrir a otros tenants.
