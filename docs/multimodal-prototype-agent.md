# Multimodal Input Agent

Estado: funcion de plataforma para todos los bots Nextfor. Audio e imagen usan la configuracion aislada de cada tenant.

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

1. Probar cada nuevo tipo de bot con mensajes reales antes de publicar su plantilla especializada.
2. Registrar metricas de costo: audios, imagenes, errores y handoffs.
3. Agregar toggles visibles en Customer Panel.
4. Implementar respuestas de voz con ElevenLabs y envio de audio por WhatsApp.
5. Convertirlo en modulo comercial para otros tenants solo despues de pruebas y aprobacion.

## Politica de activacion

Activacion de plataforma:

- `MULTIMODAL_AGENT_ENABLED=1`
- `MULTIMODAL_AGENT_TENANT_IDS=*`
- audio e imagen se procesan dentro del tenant y el bot asignado a la conversacion;
- tipos de bot conocidos usan instrucciones especializadas y los nuevos usan un analisis neutral hasta tener su plantilla;
- confirmar panel, logs, latencia y fallback;
- mantener respuestas de voz desactivadas hasta aprobarlas como una capacidad separada.
