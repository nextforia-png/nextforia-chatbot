# Configuración de tu NexforIA

La pestaña **Configuración de tu NexforIA** reúne el conocimiento mínimo que cada negocio debe entregar para personalizar su bot sin editar prompts manualmente.

## Experiencia

El formulario está organizado en siete pasos:

1. Identidad del negocio, industria, cliente ideal y diferenciadores.
2. Sedes, cómo llegar, horarios y cobertura.
3. Productos o servicios, preguntas frecuentes y condiciones de atención.
4. Tres preguntas que cambian automáticamente según la industria.
5. Tono, vocabulario, saludo y canales.
6. Autonomía, límites y reglas de escalamiento humano.
7. Objetivos, indicadores, resultados esperados y recomendaciones para NexforIA.

Puede completarlo un administrador del cliente o un super admin de NexforIA. Los roles de agente y consulta pueden verlo, pero no publicarlo.

## Borrador y publicación

- **Guardar avance** conserva un borrador y no modifica las conversaciones.
- **Activar en el bot** exige al menos 55 % de información esencial, genera la configuración derivada y la aplica a mensajes nuevos.
- El borrador y la última versión publicada se guardan por separado. Un borrador posterior no reemplaza accidentalmente la configuración activa.
- En producción se persiste en Supabase con registros internos excluidos de métricas y conversaciones. Sin Supabase funciona en memoria para desarrollo, pero no sobrevive reinicios.

## Personalización automática

Al publicar, `bot-setup.js` normaliza las respuestas y genera una capa de instrucciones con:

- identidad y nombre del asistente;
- conocimiento del negocio, sedes, horarios y políticas;
- tono, formalidad, emojis, palabras preferidas y prohibidas;
- canales habilitados;
- acciones permitidas, límites y escalamiento;
- objetivos e indicadores del cliente;
- conocimiento específico de la industria.

Esta capa se agrega automáticamente al contexto del modelo en cada conversación nueva. La publicación conserva una revisión humana deliberada antes de cambiar el comportamiento del bot.

## Alcance técnico

La configuración automatiza conocimiento y comportamiento conversacional. Las capacidades que dependen de sistemas externos —inventario, agenda, CRM, pagos, expedientes o reservas— requieren una integración técnica por tenant antes de que el bot pueda ejecutarlas.

## Endpoints

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/admin/bot-setup` | Consulta borrador, estado publicado e industrias. |
| `PUT` | `/admin/bot-setup` | Guarda el borrador. Requiere rol admin. |
| `POST` | `/admin/bot-setup/publish` | Valida y activa la configuración. Requiere rol admin. |
| `GET` | `/admin/panel/demo-setup` | Vista sanitizada y de solo lectura para el panel demo. |
