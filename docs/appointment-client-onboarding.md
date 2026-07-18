# Alta de clientes de agendamiento en Nextfor IA

## Regla comercial

- Grupo Jurídico DERCO S.A.S. es el cliente registrado #1 de Nextfor IA.
- RAV Toys se conserva como entorno legado/demostración y no ocupa un número del nuevo registro.
- Cada cliente recibe un `tenant_id`, usuarios propios, agente de ElevenLabs derivado de la plantilla y una integración de calendario independiente.

## Qué pasa con un cliente nuevo

1. Nextfor crea el tenant y asigna el siguiente número de cliente.
2. Se duplica la plantilla de ElevenLabs; nunca se modifica el agente base.
3. Se reemplazan identidad, voz, prompt, horarios y políticas.
4. El cliente conecta su propio calendario y canales.
5. Nextfor registra el `agent_id` contra el `tenant_id`.
6. Se prueba disponibilidad y creación en un calendario de pruebas.
7. El cliente recibe acceso únicamente a su panel.
8. Después de aprobación se activan llamadas, recordatorios y operación real.

## Información necesaria del cliente

### Negocio y bot

- Razón social, marca, NIT y responsable operativo.
- Nombre del asistente, voz, idioma y tono.
- Canales que usará: teléfono, WhatsApp, web u otros.
- Horarios de atención humana y contactos de escalamiento.

### Agenda

- Proveedor: Google Calendar, Outlook, Cal.com o Calendly.
- Cuenta y calendario autorizado.
- Zona horaria.
- Días y franjas disponibles.
- Duración por tipo de cita, descansos y capacidad simultánea.
- Anticipación mínima y máxima para reservar.
- Servicios que pueden agendarse.
- Modalidad: virtual, presencial o ambas; sedes y enlaces.
- Reglas para confirmar, reagendar, cancelar y no-show.
- Recordatorios: momento, canal y texto aprobado.

### Datos y cumplimiento

- Texto de autorización de grabación y tratamiento de datos.
- Política de privacidad y tiempo de retención.
- Campos obligatorios: nombre, teléfono, correo, ciudad y motivo.
- Datos que el bot no debe solicitar.
- Casos que requieren intervención humana.

### Medición

- Cita solicitada, confirmada, reagendada, cancelada y fallida.
- Asistencia/no-show cuando el calendario o el equipo lo informe.
- Tiempo de respuesta y porcentaje de citas completadas por el bot.

## Piloto DERCO

- `tenant_id`: `grupo-derco`
- Número de cliente: `1`
- Estado: `pilot`
- Proveedor inicial: Google Calendar
- Zona horaria: `America/Bogota`
- Panel: `/admin/pilots/derco`
- Datos: `/admin/pilots/derco/data`
- Webhook de ElevenLabs: `/webhooks/elevenlabs/post-call`

## Activación técnica

1. Aplicar `docs/supabase-appointments-pilot.sql`.
2. Configurar `ELEVENLABS_WEBHOOK_SECRET`.
3. Configurar `ELEVENLABS_DERCO_AGENT_ID` con el agente real de DERCO.
4. Activar `SUPABASE_APPOINTMENTS_ENABLED=1`.
5. Crear un usuario DERCO en `DASHBOARD_USERS` con `tenant_id: "grupo-derco"`.
6. En ElevenLabs, apuntar el post-call webhook a `https://api.nextforia.com/webhooks/elevenlabs/post-call`.
7. Ejecutar una llamada de prueba y confirmar que la cita aparezca en el panel.

Ejemplo de usuario aislado por tenant:

```json
[
  {
    "username": "admin-derco",
    "email": "administracion@cliente.example",
    "password": "GENERAR_CLAVE_SEGURA",
    "name": "Administrador DERCO",
    "role": "admin",
    "tenant_id": "grupo-derco"
  }
]
```
