# RAV Toys WhatsApp + Instagram Bot

Bot de WhatsApp para RAV Toys (Medellín, Colombia). Atiende clientes 24/7 con búsqueda de productos en Shopify, manejo de garantías, envíos, cierre de ventas con derivación a humanos cuando se necesita, y captura de calificaciones.

---

## 🎯 Qué hace

- 🔍 **Búsqueda de productos** en Shopify storefront — devuelve los mismos resultados que ve el cliente en la web
- 🛒 **Carrito y cierre de venta** — el cliente pega links de productos y el bot toma el pedido
- ✨ **Recomendaciones inteligentes** — 3 opciones + link al catálogo filtrado por la búsqueda del cliente
- 🛡️ **Garantías** — flujo guiado con factura, cédula, fecha, motivo + handoff a humano
- 🚚 **Envíos** — info de transportadoras + same-day para Medellín con handoff opcional
- 📦 **Estado de pedidos** — consulta Shopify Admin por número de pedido + nombre y devuelve guía/rastreo si coincide
- ⭐ **Calificaciones** — pide rating 1-5 al cierre o post-handoff; rating bajo escala a humano
- 🤝 **Handoff a humano** — Eliana (asesora comercial) recibe alertas en su WhatsApp
- 🙈 **Manejo cálido de multimedia** — explica que aún no ve imágenes y guía al cliente a mandar links

---

## 🏗️ Stack

- **Runtime:** Node.js en [Render](https://render.com) (free tier — duerme tras 15 min sin tráfico, ~50s spin-up)
- **Webhook:** Meta WhatsApp Business Cloud API
- **IA:** Anthropic Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`)
- **Catálogo:** Shopify storefront search JSON endpoint (`ravtoys.com/search?q=X&view=json`)
- **Memoria:** Supabase para logs persistentes + Maps en memoria para carritos/estado activo

---

## ⚙️ Variables de entorno (Render)

| Variable | Descripción |
|---|---|
| `WA_TOKEN` | Token permanente de Meta WhatsApp |
| `PHONE_NUMBER_ID` | ID del número WhatsApp registrado en Meta |
| `VERIFY_TOKEN` | Token de verificación del webhook (default: `rav_toys_webhook_2026`) |
| `IG_ACCESS_TOKEN` | Token del Instagram Professional account autorizado en Meta |
| `IG_USER_ID` | ID del Instagram Professional account que enviará respuestas |
| `IG_SEND_ID` | ID usado en `/messages`; usa `IG_USER_ID` por defecto. Con Facebook Login, usa el ID de la página vinculada |
| `IG_GRAPH_BASE_URL` | Host de Graph API. Usa `https://graph.instagram.com` por defecto o `https://graph.facebook.com` con Facebook Login |
| `IG_VERIFY_TOKEN` | Token para verificar `/instagram/webhook`; usa `VERIFY_TOKEN` si se omite |
| `META_GRAPH_VERSION` | Versión de Graph API para Instagram (default: `v23.0`) |
| `ANTHROPIC_API_KEY` | API key de Anthropic (Claude) |
| `SHOPIFY_STORE_DOMAIN` | Dominio Shopify (default: `ravtoys.myshopify.com`) |
| `SHOPIFY_ADMIN_TOKEN` | Token Admin de Shopify (`shpat_...`) con permisos para leer pedidos y fulfillments |
| `SHOPIFY_ADMIN_API_VERSION` | Versión Admin API para pedidos (default: `2026-04`) |
| `SHOPIFY_ORDER_PREFIXES` | Prefijos de pedidos separados por coma para validar entradas cortas como `1154` contra `RAV-1154` |
| `SUPABASE_URL` | URL del proyecto Supabase para logs persistentes |
| `SUPABASE_KEY` | Service key de Supabase para `conversation_logs` |
| `DASHBOARD_KEY` | Clave para endpoints admin protegidos |
| `DASHBOARD_USERS` | Usuarios del panel: `nexforia:clave:super_admin,admin:clave:admin,eliana:clave:agent,visor:clave:viewer` o JSON equivalente |
| `DASHBOARD_SESSION_SECRET` | Secreto para firmar cookies del panel; si falta usa `DASHBOARD_KEY` |
| `DASHBOARD_SESSION_TTL_HOURS` | Duración de sesión del panel (default: `12`) |
| `NOTIFICATION_PHONES` | Números a notificar (CSV sin +): `573013507371,573046653449` |

---

## 📡 Endpoints admin

| Endpoint | Para qué |
|---|---|
| `GET /admin` | Entrada corta al panel operativo con pantalla de clave |
| `POST /admin/login` | Crea sesión del dashboard por usuario/clave o clave maestra |
| `POST /admin/logout` | Cierra la sesión del dashboard |
| `GET /admin/session` | Devuelve usuario/rol activo del dashboard |
| `POST /admin/customer-invite` | Super admin: genera una invitación de 72 horas para crear el primer acceso de RAV Toys |
| `GET/POST /admin/setup/rav-toys` | Formulario y creación segura del usuario administrador del cliente |
| `GET /admin/access-model?key=XXXX` | Modelo futuro de acceso: `super_admin` NexforIA y roles Admin del cliente |
| `GET /admin/super-admin?key=XXXX` | Panel de plataforma NexforIA; acceso exclusivo para `super_admin` |
| `GET /admin/health` | Estado del bot: versión, uptime, conexión a Shopify/Meta/Supabase y readiness de infraestructura |
| `GET /admin/stats?key=XXXX` | Snapshot del estado: handoffs activos, ratings pendientes, carritos en curso |
| `GET /admin/conversations?limit=N&key=XXXX` | Conversaciones recientes desde Supabase si está disponible |
| `GET /admin/dashboard?key=XXXX` | Panel operativo con tabs para métricas e intervención humana |
| `GET /admin/panel?channel=whatsapp\|instagram&tab=summary` | Panel de control del cliente con KPIs, conversaciones e intervención separados por canal |
| `GET /admin/panel-demo?channel=whatsapp\|instagram&tab=summary` | Demo pública de solo lectura con datos sanitizados |
| `GET /admin/panel/data` | Datos protegidos del panel, con `summaries.whatsapp`, `summaries.instagram` y conversaciones identificadas por canal |
| `GET /admin/inbox?key=XXXX` | Acceso directo opcional a la bandeja operativa |
| `GET /admin/customer-meta?key=XXXX` | Etiquetas y notas internas por cliente para el panel |
| `POST /admin/customer-meta/:userId` | Guarda etiquetas/notas internas del cliente seleccionado |
| `GET /admin/templates?key=XXXX` | Lista plantillas WhatsApp configuradas localmente |
| `GET /admin/commercial-readiness?key=XXXX` | Checklist comercial/multi-cliente para preparar onboarding de futuros clientes |
| `POST /admin/template-test` | Genera payload de plantilla o envia con `send: true` si ya fue aprobada |
| `GET /admin/smoke-check?q=XXXX` | Simula búsqueda, selección, checkout y total sin enviar WhatsApps |
| `POST /admin/order-status-test` | Prueba consulta de pedido Shopify con `order_number`, `customer_name`, `phone_or_email` opcional |
| `POST /admin/alert` | Envía alerta interna protegida por `DASHBOARD_KEY` |
| `GET /admin/test-search?q=XXXX&key=YYYY` | Prueba la búsqueda de productos sin afectar a clientes reales |
| `GET /admin/release/:userId` | Libera un handoff manual de Eliana (vuelve el bot a atender) y marca para pedir rating |

### Webhook de Instagram

Configura en Meta el callback `https://TU-DOMINIO/instagram/webhook` con el valor de
`IG_VERIFY_TOKEN` y suscribe el campo de mensajes. El endpoint acepta eventos de texto y
archivos del objeto `instagram`; las conversaciones quedan identificadas como `ig:<IGSID>`
en el panel para evitar mezclarlas con números de WhatsApp.

Para desarrollo, agrega la cuenta profesional y las cuentas que harán pruebas como roles
de la app. Para atender cuentas externas, solicita acceso avanzado a
`instagram_business_manage_messages` mediante Meta App Review.

El Panel de Control muestra Instagram como un módulo independiente dentro de Atención al
cliente. Sus KPIs, conversaciones, alertas de intervención, notas y tags se calculan sin
mezclarlos con WhatsApp. El panel nunca expone tokens ni IDs internos de configuración.
Cuando un usuario escribe por Instagram, el bot consulta y guarda su `@username` con la
API oficial de perfiles. El panel muestra ese usuario y permite buscarlo; si Meta no lo
entrega, conserva como respaldo el identificador abreviado de la conversación.

### Primer cliente: RAV Toys

RAV Toys es el cliente #1 y usa el tenant actual `rav-toys`. El super admin genera una
invitación desde `/admin/super-admin` con **Crear acceso RAV**. El cliente abre el enlace,
elige su usuario y contraseña, y entra con rol `admin`. La invitación vence en 72 horas y
deja de funcionar cuando la cuenta queda creada. La contraseña nunca se guarda en texto
plano: se almacena como un hash `scrypt` con salt dentro del registro interno persistente.

**Uso típico antes de un cambio:** abrir `/admin/health` para ver que todo está OK, después `/admin/test-search?q=carros+montables` para verificar búsquedas.

---

## 🧭 Operación y próximos pasos

- Plantillas WhatsApp iniciales: [`docs/whatsapp-templates.md`](docs/whatsapp-templates.md)
- Playbook comercial para asesoras: [`docs/commercial-playbook.md`](docs/commercial-playbook.md)
- Onboarding comercial para futuros clientes: [`docs/commercial-onboarding.md`](docs/commercial-onboarding.md)
- Roadmap multi-cliente: [`docs/multi-tenant-roadmap.md`](docs/multi-tenant-roadmap.md)
- División Admin/Super admin: [`docs/admin-super-admin-split.md`](docs/admin-super-admin-split.md)
- Informe ejecutivo para socios: [`docs/informe-socios-rav-whatsapp-bot.md`](docs/informe-socios-rav-whatsapp-bot.md)
- Backlog priorizado: [`TODO.md`](TODO.md)

---

## 🛡️ Red de seguridad y monitoreo

Los scripts usan por defecto producción (`https://rav-whatsapp-bot.onrender.com`) y leen secretos desde variables de entorno. No pegues llaves en el código.

### Intervención humana

Antes de migrar un número real a WhatsApp Cloud API, usa la sección de intervención humana dentro del dashboard:

```text
https://rav-whatsapp-bot.onrender.com/admin
```

Desde ahí el equipo puede tomar control de un chat, responder por WhatsApp usando la Cloud API y devolver la conversación al bot. El estado de control humano se registra en Supabase y el panel lo reconstruye desde el historial para sobrevivir reinicios de Render.

Flujo operativo recomendado:

1. Abre `/admin` y entra a la tab **Intervención humana**.
2. Usa el filtro **Pendientes** para ver chats en humano con mensajes del cliente sin respuesta humana posterior.
3. Usa etiquetas y notas internas para marcar venta, garantía, pago pendiente, envío o revisión.
4. Si el chat está en **Bot**, usa **Tomar control** antes de intervenir o escribe directamente desde el compositor; al enviar, el bot queda pausado para ese cliente.
5. Cuando termines, usa **Devolver al bot** para reactivar automatización y pedir calificación al cliente.
6. Revisa el indicador **Infra OK**; si aparece en rojo, abre `/admin/health` antes de seguir pruebas.

Variables útiles:

| Variable | Default | Para qué sirve |
|---|---:|---|
| `BOT_BASE_URL` | `https://rav-whatsapp-bot.onrender.com` | URL del bot a verificar |
| `DASHBOARD_KEY` | *(requerida para smoke/alertas)* | Autoriza `/admin/smoke-check` y `/admin/alert` |
| `EXPECTED_BOT_VERSION` | lee `BOT_VERSION` local en `verify-deploy.js` | Versión esperada post-deploy |
| `SMOKE_QUERY` | `juguete` | Término real para la prueba de búsqueda |
| `ALERT_ON_FAILURE` | `1` | Usa `0` para no alertar por WhatsApp |
| `COLD_START_RETRIES` | `2` | Reintentos para Render free tier |
| `COLD_START_DELAY_MS` | `60000` | Espera entre reintentos por cold start |
| `MONITOR_PENDING_HANDOFF_MINUTES` | `10` | Minutos máximos para chats en humano pendientes de respuesta |
| `ALERT_COOLDOWN_MINUTES` | `30` | Ventana anti-spam para no repetir la misma alerta operativa |

### Prueba de humo post-deploy

Valida: health OK, versión esperada opcional, búsqueda real con resultados, selección desde resultados reales, datos de checkout completos, total distinto de `$0`, y lectura de conversaciones desde Supabase.

```bash
DASHBOARD_KEY=... EXPECTED_BOT_VERSION=v60 npm run smoke
```

También puedes apuntar a staging:

```bash
BOT_BASE_URL=https://rav-whatsapp-bot-staging.onrender.com DASHBOARD_KEY=... npm run smoke
```

### Verificación de deploy

Espera hasta 5 minutos a que Render tenga la versión esperada y falla si el auto-deploy quedó atrás.

```bash
DASHBOARD_KEY=... EXPECTED_BOT_VERSION=v60 npm run verify-deploy
```

Si se ejecuta desde el repo, `verify-deploy.js` puede leer `BOT_VERSION` directamente de `index.js`, así que `EXPECTED_BOT_VERSION` es opcional.

### Monitoreo de salud

Revisa `/admin/health`, `/admin/stats` y `/admin/conversations?limit=100`. Alerta si hay errores, Supabase no responde, Meta/Shopify fallan, handoff alto, búsquedas sin resultados repetidas, saldo Anthropic agotado, o chats en intervención humana pendientes por más de `MONITOR_PENDING_HANDOFF_MINUTES`.

```bash
DASHBOARD_KEY=... npm run monitor
```

Umbrales configurables:

```bash
MONITOR_MAX_HANDOFF_RATE=0.4 \
MONITOR_MAX_ZERO_RESULT_RATE=0.35 \
MONITOR_REPEATED_ZERO_QUERY_COUNT=3 \
MONITOR_PENDING_HANDOFF_MINUTES=10 \
DASHBOARD_KEY=... npm run monitor
```

Para correrlo como proceso continuo:

```bash
DASHBOARD_KEY=... MONITOR_INTERVAL_MS=300000 node monitor.js --loop
```

### Cron sugerido

```cron
*/5 * * * * cd /ruta/rav-whatsapp-bot && DASHBOARD_KEY=... npm run monitor >> monitor.log 2>&1
```

### GitHub Action

El workflow listo para activar `.github/workflows/rav-bot-safety-checks.yml` corre `npm run monitor` cada 10 minutos, en pushes a `main` y manualmente con `workflow_dispatch`. Requiere un token/sesion de GitHub con permiso `workflow` para poder subirlo al repo, y el secret `DASHBOARD_KEY` en GitHub Actions. Si detecta fallas o chats humanos pendientes por encima del umbral, envia alerta por WhatsApp al equipo usando `/admin/alert`, con cooldown anti-spam de 30 minutos por tipo de alerta.

La copia en `docs/github-actions-safety-checks.yml` queda como referencia editable.

---

## 🌊 Flujo de conversación

```
Cliente → Webhook Meta → Bot (Claude)
                         ├── search_products       → Shopify storefront
                         ├── send_product_card     → Meta WhatsApp API
                         ├── select_product        → Estado interno (carrito)
                         ├── save_warranty_field   → Estado interno (garantías)
                         ├── send_shipping_info    → Texto plano
                         ├── send_rating_request   → Texto plano
                         ├── save_rating           → Notificación a Boss
                         └── request_human_handoff → Notificación a Eliana
```

**Reglas clave del prompt:**
- LIMITE DURO: máximo 1 `search_products` por turno (anti rate-limit)
- 3 productos máximo por recomendación + link al catálogo de búsqueda
- Tono: empático, "peque" como gender-neutral
- IMÁGENES: bot no las ve; pide al cliente mandar el link del producto

---

## 🚀 Deploy

El servicio en Render auto-deploya cuando hay un push a la rama `main` de este repo.

1. `git push origin main` (o editar via web GitHub)
2. Render detecta el cambio y despliega automáticamente (~60-90s)
3. Verificar con `GET /admin/health` que el bot esté arriba

---

## 🐛 Troubleshooting

### El bot no responde
1. Abrir `/admin/health` — si muestra error, ver qué dependencia falla
2. Si `anthropic_key_present: true` pero el bot no responde, probable saldo agotado → recargar en https://platform.claude.com/settings/billing
3. Si `shopify_storefront` da error, ver si `ravtoys.com` responde

### El bot dice "no encontré" pero la web sí muestra productos
- Probar `/admin/test-search?q=lo+mismo` — si devuelve 0 resultados, hay bug
- Si devuelve resultados, posiblemente el modelo no los está pasando al cliente — revisar logs de Render

### Costos disparados
- Verificar token usage en https://platform.claude.com/settings/usage
- Ratio sano: input/output ~10:1 después del prompt caching (v30+)
- Si ratio >30:1, prompt caching no está funcionando — revisar que `cache_control` esté en system+tools

### Logs en Render
- Dashboard → `rav-whatsapp-bot` → `Logs` (free tier solo guarda 1h)
- Logs estructurados (v32+) en formato JSON: `{ts, level, event, ...data}`

---

## 📋 Histórico de versiones (resumido)

| Versión | Cambio principal |
|---|---|
| v9-v22 | Construcción base: tools, garantías, envíos, handoffs |
| v23 | Try/catch en notifyTeam (#131030 no crashea flujo) |
| v24-v25 | Sonnet 4.5 + envíos Medellín same-day |
| v26 | Sistema de calificación 1-5 con triggers natural y post-handoff |
| v27 | 3 opciones + link de búsqueda específico al catálogo |
| v27.1 | Hard cap 1 `search_products` por turno (anti rate-limit) |
| v28 | CTA "mándame el link y te tomo el pedido" + multimedia handling cálido |
| v29 | Búsqueda migrada a Shopify storefront JSON (cero falsos negativos) |
| v30 | Prompt caching + historial 12→8 (-85% input cost) |
| v31 | Endpoints admin: health, stats, test-search |
| v32 | Alerta de saldo bajo + cache de búsqueda 5min + logger estructurado |
| v32.1 | `BOT_VERSION` constante centralizada |
| v59 | Roles `super_admin`/Admin y endpoint del modelo de acceso |
| v60 | Panel Super admin v1 separado, protegido y enlazado por rol |
| v64 | RAV Toys como cliente #1 y creación segura de su acceso por invitación |
| v65 | `@username` real de los clientes de Instagram en conversaciones y búsqueda |

---

## 👥 Contacto

- **Owner:** Santiago Velásquez (CEO RAV Toys)
- **Asesora comercial:** Eliana (responde handoffs)
- **Tienda física:** Planet Selva, CC El Tesoro, Local 3729 (Medellín)
- **E-commerce:** [ravtoys.com](https://ravtoys.com)
