# Lecciones del setup de Atención al Cliente aplicadas a Appointment

Estas reglas existen para que el setup de Appointment fluya mejor que el primer
setup de Atención al Cliente y no repita errores operativos.

## Aciertos que sí debemos conservar

1. **Un solo setup compartido, configuraciones separadas.**  
   El cliente completa un recorrido común, pero `customer_service_configuration`
   y `appointment_configuration` se generan por separado. Esto evita pedir los
   mismos datos dos veces sin mezclar responsabilidades.

2. **Super Admin revisa antes de construir y antes de Live.**  
   El cliente no debe activar un bot real solo por terminar el formulario. El
   estado debe pasar por `Ready → Building → Testing → Live`.

3. **Datos comunes se reutilizan.**  
   Marca, contacto, país, WhatsApp, email y consentimiento deben alimentar ambos
   bots cuando `setup_goal = both`.

4. **El panel debe mostrar bloqueos reales.**  
   El cliente y Super Admin necesitan ver si falta calendario, WhatsApp, agente
   ElevenLabs, webhook, llamadas o Supabase. No basta con decir “setup completo”.

5. **Nada de secretos en el setup.**  
   El formulario pide intención y dueño de acceso; las conexiones reales se hacen
   con OAuth, variables de entorno o herramientas administrativas.

## Errores que no se deben repetir

1. **No mezclar prompts ni configuración entre bots.**  
   Appointment no debe heredar reglas comerciales de Atención al Cliente, y
   Atención al Cliente no debe gestionar citas.

2. **No descubrir bloqueos externos al final.**  
   DNS, OAuth, webhooks, Supabase, agent map y feature flags deben aparecer en
   el gate técnico desde el inicio.

3. **No hardcodear el primer cliente como si fuera el modelo.**  
   DERCO es piloto, no arquitectura. Todo debe funcionar por `tenant_id`.

4. **No fingir Live con demos.**  
   Los datos de demo ayudan a diseñar UI, pero la luz verde exige cita real,
   calendario real, canal real y evidencia en panel.

5. **No hacer preguntas largas sin decir para qué sirven.**  
   Cada pregunta debe explicar qué desbloquea: prompt, calendario, canal,
   escalamiento, cumplimiento o medición.

6. **No pedir todo antes de dar avance.**  
   El setup debe permitir guardar progreso, dejar opcionales para después y
   mostrar “siguiente bloqueo” en vez de una lista abrumadora.

## Reglas UX para el setup de Appointment

1. **Primero objetivo, después profundidad.**  
   El cliente elige Atención, Appointment o Ambos. Solo ve preguntas que aplican.

2. **Separar “configurar bot” de “conectar proveedores”.**  
   El formulario define negocio y reglas; el panel conecta Google Calendar,
   WhatsApp/Meta y llamadas.

3. **Preguntar en lenguaje operativo, no técnico.**  
   Usar “¿Quién atiende las citas?” antes que “modelo de recursos”; “Calendario
   actual” antes que “provider”.

4. **Dar ejemplos por industria.**  
   Salud, legal, belleza, automotriz y servicios profesionales deben mostrar
   ejemplos distintos de servicios, restricciones y escalamiento.

5. **Permitir “no sé todavía” sin romper el flujo.**  
   Si el dato no bloquea el prompt inicial, queda como pendiente para Super
   Admin o para la conexión posterior.

6. **Mostrar resumen editable antes de aprobar.**  
   Super Admin debe ver qué usará el bot, corregirlo y recién ahí aprobar
   Testing.

7. **Mostrar el siguiente paso único.**  
   En vez de muchos errores, el panel debe priorizar: calendario, WhatsApp,
   agente real, llamadas, Supabase o aprobación final.

8. **Cada conexión debe tener dueño claro.**  
   Si falta Google/Meta/ElevenLabs, el panel debe decir si lo hace el cliente,
   Super Admin o infraestructura Nextfor.

9. **Las acciones reales no pueden ser solo UI.**
   Confirmar, cancelar o reprogramar desde Customer Panel debe persistir por
   `tenant_id`, quedar visible para Super Admin y distinguir “guardado” de
   “enviado/sincronizado” cuando el canal externo todavía no confirma ejecución.

## Criterio de luz verde

Appointment solo está listo cuando hay evidencia de:

- setup aprobado;
- configuración Appointment aprobada para Testing;
- agente ElevenLabs real mapeado y configurado para el `tenant_id`;
- webhook post-call disponible;
- calendario real conectado;
- WhatsApp real conectado si el cliente lo pidió;
- llamadas listas si el cliente las pidió;
- persistencia de citas activa;
- prueba real de cita visible en Customer Panel y Super Admin;
- aprobación explícita de Super Admin antes de `APPOINTMENTS_PUBLIC_ENABLED=1`.

El comando `pnpm verify:appointments --require-dashboard-key` debe validar
también `/admin/appointments-overview`: si Super Admin no puede ver la flota de
agendamiento o DERCO no aparece como piloto, no hay luz verde.
