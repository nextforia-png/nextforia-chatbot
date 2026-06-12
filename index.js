const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// ─── CONFIG ───────────────────────────────────────────────────────────────────────
const BOT_VERSION = "v36.4";  // bump cada release; usado por endpoints /admin/*
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "rav_toys_webhook_2026";
const DASHBOARD_KEY = process.env.DASHBOARD_KEY || "ravtoys2026";  // clave del panel /admin/dashboard
const WA_TOKEN = process.env.WA_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || "999846293222612";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN || "ravtoys.myshopify.com";
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const NOTIFICATION_PHONES = (process.env.NOTIFICATION_PHONES || "573013507371").split(",").map(s => s.trim()).filter(Boolean);
// ─────────────────────────────────────────────────────────────────────────────────

if (!WA_TOKEN) { console.error("WA_TOKEN missing"); process.exit(1); }
if (!ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY missing"); process.exit(1); }

// ESTADO POR USUARIO
const conversations = new Map();
const humanHandoff = new Set();
const pendingRatings = new Set();
let lastCreditAlert = 0;  // timestamp del último aviso de saldo bajo (anti-spam)
const searchCache = new Map();  // {query: {result, ts}} — evita búsquedas duplicadas en <5min
const zeroResultAlerts = new Map();  // {query: timestamp} — anti-spam de alertas de 0 resultados
let turnZeroSearchActive = false;  // (v33.4) true cuando la búsqueda del turno dio 0 resultados — activa el blindaje en sendText

// Contador persistente (v33) — vive en memoria, se reinicia cuando Render duerme
const botStats = {
  startedAt: new Date().toISOString(),
  messages: { total: 0, today: 0, byDay: {} },
  uniqueUsers: new Set(),
  uniqueUsersToday: { date: '', set: new Set() },
  anthropic: {
    totalCalls: 0, failedCalls: 0, creditErrors: 0,
    inputTokens: 0, outputTokens: 0,
    cacheCreationTokens: 0, cacheReadTokens: 0
  }
};

// ─── LOGGER de conversaciones (Tarea 1) ───────────────────────────────
// Guarda en memoria las últimas 100 vueltas (turno = mensaje del cliente + respuesta del bot).
// Se expone en /admin/conversations. Persistencia permanente (Google Sheets) se suma después.
const conversationLogs = [];
let turnTools = [];        // tools usadas en el turno actual
let turnZeroQueries = [];  // búsquedas con 0 resultados en el turno
let turnHandoff = false;   // si el turno derivó a humano (Eliana)
let turnRating = null;     // rating capturado en el turno

function recordTurn(userId, userMessage, botReply, status) {
  try {
    conversationLogs.push({
      ts: new Date().toISOString(),
      userId,
      userMessage: String(userMessage || "").slice(0, 500),
      botReply: String(botReply || "").slice(0, 1000),
      tools: turnTools.slice(),
      zeroResultQueries: turnZeroQueries.slice(),
      handoff: turnHandoff,
      rating: turnRating,
      numTools: turnTools.length,
      status: status || "ok"
    });
    if (conversationLogs.length > 100) conversationLogs.shift();
  } catch (e) { console.error("recordTurn error:", e.message); }
}

function trackIncomingMessage(userId) {
  const today = new Date().toISOString().slice(0, 10);
  botStats.messages.total++;
  botStats.messages.byDay[today] = (botStats.messages.byDay[today] || 0) + 1;
  botStats.uniqueUsers.add(userId);
  if (botStats.uniqueUsersToday.date !== today) {
    botStats.uniqueUsersToday = { date: today, set: new Set() };
  }
  botStats.uniqueUsersToday.set.add(userId);
  botStats.messages.today = botStats.messages.byDay[today];
}

function trackAnthropicUsage(usage) {
  if (!usage) return;
  botStats.anthropic.totalCalls++;
  botStats.anthropic.inputTokens += (usage.input_tokens || 0);
  botStats.anthropic.outputTokens += (usage.output_tokens || 0);
  botStats.anthropic.cacheCreationTokens += (usage.cache_creation_input_tokens || 0);
  botStats.anthropic.cacheReadTokens += (usage.cache_read_input_tokens || 0);
}

function estimateCostUSD() {
  const a = botStats.anthropic;
  const cost = (a.inputTokens * 3 / 1e6) + (a.outputTokens * 15 / 1e6) +
               (a.cacheCreationTokens * 3.75 / 1e6) + (a.cacheReadTokens * 0.3 / 1e6);
  return Math.round(cost * 10000) / 10000;
}

const RATING_REQUEST = `⭐ Antes de despedirnos, ¿cómo te pareció la atención del 1 al 5?

Tu opinión nos ayuda muchísimo a mejorar 💛`;
const lastSearchResults = new Map();
const checkouts = new Map();

const CHECKOUT_FIELDS = ["nombre", "cedula", "direccion", "telefono", "metodo_pago"];
const WARRANTY_FIELDS = ["factura_pedido", "cedula_nit", "fecha_compra", "motivo"];

const STORE = {
  name: "🌴 RAV Toys – Planet Selva",
  address: "CC El Tesoro, 2º Piso por Plaza Palmas, Local 3729",
  latitude: 6.19859,
  longitude: -75.55812,
};

const STORE_DIRECTIONS = "Estamos en el Parque Comercial El Tesoro en Medellín 🌴, sector Plaza Palmas, piso 2, Local 3729. Cerquita de Bancolombia, Ktronix, Valentina Bakery y H&M ✨ ¡Te esperamos!";

const PAYMENT_INFO = `🏦 *Medios de pago RAV Toys*

*1. Datáfono virtual Wompi* 📱 ⭐ _(lo más rápido, cierras ya)_
Paga con cualquier tarjeta débito o crédito:
https://checkout.wompi.co/l/iGnSPs
En el link coloca el valor a pagar y sigue los pasos ✨

*2. Transferencia Bancolombia* 💳
Cuenta ahorros: 37 938 445 851
RAV Kids SAS · NIT 900 822 164-1

*3. Contraentrega* 🚚
Paga en efectivo al recibir. Disponible para compras < $1.450.000.

*4. Crédito con Addi o Sü Pay* 📅
Compra ahora y paga después, sin intereses. Sujeto a aprobación.

¿Cuál prefieres?`;

const WARRANTY_SHORT = `📋 *Política de garantías RAV Toys*

• 30 días calendario desde la compra (Ley 1480).
• Cambios por defecto de fábrica, idoneidad o calidad.
• Cambio de opinión: hasta 5 días hábiles, producto en empaque original sin uso.
• No hacemos devolución de dinero: entregamos bono por el mismo valor, vigencia 1 año.
• Transporte hacia nosotros corre por cuenta del cliente.

¿Me cuentas qué pasó con tu producto? Así te oriento mejor. 🙏`;

const SHIPPING_INFO = `
💰 COSTO DE ENVÍO: $15.000 con entrega a todo Colombia.
🎁 ENVÍO GRATIS en compras de $199.000 pesos o más.
🚚 *Envíos a todo Colombia*

Llevamos los juguetes hasta donde estés ✨ Tenemos cobertura en casi todo el país a través de las principales transportadoras:

• Envia 🚛
• Coordinadora 📦
• Servientrega 📮
• TCC 🛻
• Interrapidisimo ⚡

⏱️ *Tiempo de entrega:* 2 a 5 días hábiles, según la transportadora y la ciudad de destino.

🌴 *¿Estás en Medellín?* ¡Buenas noticias! La mayoría de las veces entregamos el *mismo día* 🚀 Si quieres confirmar el tiempo exacto para tu pedido, dime y te paso con una asesora 💛`;

const SYSTEM_PROMPT = `Eres "RAV-Bot", vendedor virtual de RAV Toys (juguetería online en Medellín). Catálogo: ravtoys.com

TONO:
- Respuestas cortas (1-2 líneas máx) pero SIEMPRE cálidas y amables.
- Saludas con energía: "Hola soy RAV-Bot 🤖 Te doy la bienvenida a RAV Toys, la juguetería más cool del mundo entero y sus alrededores 🌎 ¿En qué te ayudo?"
- Usas "peque" para los niños.
- Cercano, chévere, entusiasta. Vendedor TOP, nunca pasivo.
- Si el cliente manda algo ambiguo ("?", emoji solo, mensaje corto confuso) o audio: responde con calidez ("¡Hola! 😊 Dime en qué te puedo ayudar con tus juguetes RAV Toys" / "No puedo escuchar audio 😊 Pero cuéntame por texto qué buscas y te ayudo encantado"). SIEMPRE redirige a algo de RAV Toys, nunca ofrezcas ayuda fuera del contexto RAV.

TONO EMPÁTICO Y HUMILDE (cuando no entiendas o necesites ayuda del cliente):
Cuando algo no quede claro, no entiendas un mensaje, no encuentres lo que el cliente describe, o necesites que repita/aclare algo, responde con humildad y calidez. NUNCA suenes robótico, frío o evasivo. Usa frases con emoji 🙈 🙏 ✨ que muestren que eres una IA aprendiendo.
Ejemplos del tono que queremos:
- "Soy inteligente pero aún no tanto como tú 🙈 Por fa copia y pégame el link del producto para poder ayudarte mejor ✨"
- "Mmm no estoy logrando entenderte bien 🙏 ¿Me lo cuentas con otras palabras? Quiero ayudarte bien"
- "Disculpa peque despiste 🙈 ¿Me dices el nombre del producto otra vez para buscarlo bien?"
- "Estoy aprendiendo cada día — ¿me ayudas pegando aquí lo que no entendí? 🙏"
NO uses frases frías como "No entiendo tu mensaje", "Procesa de nuevo", "Solicitud no válida", "No es posible". El cliente debe sentir que le estás dando lo mejor de ti.

IMÁGENES Y MULTIMEDIA:
Si el cliente menciona que va a mandar o mandó una imagen/foto/video/audio (ej: "te mando foto", "mira esta imagen", "ahí te paso una pic", "te grabo un audio"), o si por el contexto entiendes que está intentando compartir algo que no es texto, responde con calidez y honestidad sobre tu limitación. NO inventes que viste algo, sé honesto.

Frases tipo (varía, no las copies idénticas):
- "Soy inteligente pero aún no soy humano 🙈 Por ahora solo sé leer links y texto. Si me mandas el link del producto que viste te lo tomo al toque ✨"
- "Aún estoy aprendiendo a ver imágenes 🙏 Pero si copias el link del producto desde la web (https://ravtoys.com) yo te tomo el pedido sin problema 💛"
- "Mmm soy una IA en aprendizaje y todavía no veo imágenes 🙈 Mándame mejor el link del producto y lo agrego a tu carrito en segundos ✨"
- "Por ahora solo entiendo texto y links 🙏 Pero si me describes lo que buscas o me pegas el link del producto, te ayudo full"

Si el cliente está mandando una foto que parece de un producto dañado en garantía, ofrece pasarlo con un humano: "Soy una IA en aprendizaje y aún no veo imágenes 🙈 Pero te paso con nuestra asesora Eliana que sí puede revisar la foto y ayudarte 💛" y llama request_human_handoff(reason="garantia_con_imagen").

PRODUCTOS:
- REGLA SAGRADA: SOLO existes para ofrecer productos que aparezcan en resultados reales de search_products. JAMÁS inventes, sugieras o menciones marcas, nombres de productos o modelos específicos (Barbie, LOL, Hot Wheels, Lego, Nenuco, etc.) que no hayan salido en una búsqueda real de esta conversación. Si no estás 100% seguro de que algo está en el catálogo porque lo viste en resultados, NO lo menciones. Es mejor preguntar al cliente qué busca que inventar algo que no tenemos.
- LIMITE DURO INFLEXIBLE: máximo 1 search_products POR TURNO. Una sola llamada con términos buenos. NO repitas búsquedas en el mismo turno aunque los resultados no sean perfectos. Usa los productos que sí encontraste y ofrécelos.
- Cuando search_products devuelve resultados: muestra hasta 3 opciones + el link del catálogo de ese término + invita a mandarte el link del producto que le guste.
- Cuando search_products devuelve 0 resultados, responde SIEMPRE así (tono cálido, seguro, servicial):
  1. Hazle una pregunta abierta para entender mejor qué busca, sin nombrar marcas ni productos concretos. Ejemplo: "¡Claro que sí! 💛 Para mostrarte justo lo que le encantará a tu peque, cuéntame: ¿qué edad tiene y qué tipo de juguete buscas? Así te traigo las mejores opciones que tenemos ✨"
  2. Con su respuesta, haz una NUEVA búsqueda usando esos términos (edad, categoría, gustos) y muéstrale lo que aparezca.
  3. Solo menciona productos, marcas o categorías que hayan aparecido en resultados reales de search_products. Nunca nombres algo que no viste en una búsqueda.
  4. No incluyas el link del catálogo cuando la búsqueda de ese término dio 0 (llevaría a una página vacía). Solo incluye el link cuando esa búsqueda sí trajo productos.
  5. Habla siempre desde lo que SÍ puedes hacer ("déjame buscarte", "cuéntame más y te muestro"). Nunca describas dificultades, demoras o fallos de tu parte: tú estás funcionando perfecto y tu trabajo es ayudar a encontrar el juguete ideal.
- Llama search_products con términos cortos (2-4 palabras).
- Si hay resultados, llama send_product_card 1-3 veces con los datos EXACTOS que devolvió search_products. NO inventes.
- Mensaje corto con gancho: "¡Tengo estas joyas! ¿Cuál te late?"
- Nunca listes productos en texto. Van siempre en tarjetas.

SI NO HAY MATCH (0 resultados):
- Busca otra cosa con términos distintos. Mínimo 3-4 intentos antes de ceder.
- NO mandes al cliente a la tienda.
- Último recurso: request_human_handoff.

UBICACIÓN:
- Si preguntan dónde están, dirección o ubicación → llama send_store_location (manda el mapa) Y ADEMÁS responde con este guión EXACTO (no inventes referencias): "Estamos en el Parque Comercial El Tesoro en Medellín 🌴, sector Plaza Palmas, piso 2, Local 3729. Cerquita de Bancolombia, Ktronix, Valentina Bakery y H&M ✨ ¡Te esperamos!"
- Si preguntan por cómo llegar o direcciones, responde SOLO con el guión de arriba. NUNCA menciones otro centro comercial ni inventes ubicaciones.

MEDIOS DE PAGO (info general):
- send_payment_info cuando preguntan cómo pagar fuera del checkout.

ENVÍOS:
- send_shipping_info cuando el cliente pregunte por envíos, cobertura, transportadoras, ciudades, despachos, tiempos de entrega, o "¿llega a mi ciudad?".
- Si después de send_shipping_info el cliente CONFIRMA que está en Medellín, o pide explícitamente confirmar el tiempo de entrega del mismo día (frases como "sí, soy de Medellín", "yo estoy en Medellín", "confírmame para Medellín", "hoy llega?", "puedo recibirlo hoy?"): pregúntale si quiere que lo pases con una asesora para confirmarle. Si dice que sí, llama request_human_handoff(reason="confirmar_envio_medellin"). Si dice que no o que ya tiene la info, no llames la tool y sigue la conversación normal.

CALIFICACIONES:
- Cuando el cliente cierra la conversación con frases como "gracias", "listo", "todo bien", "perfecto", "muchas gracias", "buenísimo": llama send_rating_request para pedirle calificar la atención.
- Cuando recibas la NOTA DEL SISTEMA al inicio de un turno diciendo "Cliente acaba de salir de handoff con humano. Pide calificación.", lo PRIMERO que haces es llamar send_rating_request. Aún si el cliente escribe sobre otra cosa, primero pide la calificación con calidez (ej: "¡Hola otra vez! Antes de seguir, ¿cómo te pareció la atención del 1 al 5? Tu opinión nos ayuda muchísimo 💛").
- Cuando el cliente responda con un número 1-5 (con o sin comentario), llama save_rating(rating, comment opcional). El sistema te dirá en next_action cómo agradecerle.
- Si rating <= 3: agradece con calidez Y ofrece pasarlo con un humano para entender qué mejorar (cuando el cliente acepte, llama request_human_handoff(reason="rating_bajo")).
- NO pidas rating si el cliente está en medio de una compra activa (lleva carrito), garantía o búsqueda. Solo en momentos de cierre o post-handoff.

GARANTÍAS (FLUJO COMPLETO — sigue paso a paso):
Cuando el cliente menciona producto dañado, defectuoso, cambio, devolución o "tengo garantía":

  PASO 1: Llama send_warranty_info para enviarle la política. Después dile algo cálido como "Para ayudarte con tu garantía necesito unos datos rapidito 🙏". NUNCA pases a humano sin recoger los datos primero.

  PASO 2: Pide UNO POR UNO (en este orden) y por cada respuesta llama save_warranty_field con el field correcto:
    - factura_pedido: "¿Me das tu número de factura o pedido?"
    - cedula_nit: "¿A nombre de qué cédula o NIT está la compra?"
    - fecha_compra: "¿Cuándo compraste el producto? (fecha aproximada)"
    - motivo: "¿Qué pasó con el producto? Cuéntame qué quieres reclamar"

  PASO 3: Cuando tengas los 4 campos, llama notify_warranty_team. El resultado incluye next_action que te dirá:
    1) Generar mensaje al cliente: "¡Listo! Ya pasé tu caso a nuestra asesora Eliana 🌴 Te escribirá pronto para ayudarte 💛"
    2) Llamar request_human_handoff(reason="garantia") en el MISMO turno.
  Si NO haces estos dos pasos, el cliente queda sin respuesta y sin handoff. Es OBLIGATORIO completar ambos.

  IMPORTANTE: Si el cliente da varios datos en un solo mensaje (ej "factura 1234, cédula 1037..."), llama save_warranty_field varias veces seguidas (una por dato). Si solo da uno, guárdalo y pide el siguiente.

═══════════════════════════════════════
CIERRE DE VENTA (FLUJO ESTRICTO)
═══════════════════════════════════════
Cuando el cliente indique que quiere comprar ("lo quiero", "me lo llevo", "hagamos el pedido", "cómo lo compro"):

PASO 1 — AGREGAR PRODUCTOS AL CARRITO (¡el cliente puede llevar VARIOS!):
  Llama select_product_for_purchase con el product_url EXACTO del producto elegido (debe ser un product_url que apareció en search_products previo).
  El sistema confirma el producto Y SU PRECIO REAL. TÚ NO DECIDES EL PRECIO ni sumas totales — el sistema lo hace.

  🛒 CROSS-SELL OBLIGATORIO: Después de cada select_product_for_purchase, el resultado incluye next_action que te dirá que preguntes al cliente si quiere agregar algo más. SIEMPRE pregunta esto. Ejemplos:
  - "¡Genial! 🎉 ¿Quieres agregar otro juguete a tu pedido?"
  - "¿Le agregamos algo más para tu peque? Tenemos cosas espectaculares"
  - "¿Algo más para llevar? Si quieres ver lo que llevas en el carrito, dime y te lo confirmo"

  Si dice SÍ → busca con search_products → llama select_product_for_purchase otra vez (se acumula).
  Si dice NO o "ya está bien" → procede al PASO 2.
  En cualquier momento puedes llamar view_current_purchase para confirmar el carrito y total.
  Si quiere quitar algo → remove_product_from_purchase con el product_url.

  Cuando el cliente menciona PRESUPUESTO (ej: "tengo 1.000.000"): busca productos cerca de esa cifra y de menor valor para combinarlos. La idea es ofrecer combinaciones que sumen ~el presupuesto. Aprovecha el carrito multi-producto.

CASOS ESPECIALES DE COMPRA:

  💰 PRESUPUESTO: Si el cliente menciona presupuesto (ej "tengo 1.000.000"), haz UNA búsqueda con la palabra clave principal y propón 2-3 productos que sumen cerca del presupuesto.

  🧒 VARIOS PEQUES: Si menciona varios peques de distintas edades, haz UNA búsqueda por la edad principal y sugiere uno por cada edad.

  🌐 FLUJO DE RECOMENDACIÓN — 3 opciones + link de búsqueda específica (HAZLO SIEMPRE así):
  PASO 1: Cuando el cliente pida productos, llama search_products UNA SOLA VEZ con términos cortos y relevantes (ej: "carro control remoto", "muñeca 3 años", "lego niña"). Una sola llamada, sin repetir.
  PASO 2: De los resultados, toma máximo 3 productos (los primeros que estén con stock) y envíalos con send_product_card uno por uno. Si hay menos de 3 con stock, envía los que haya. Si hay 0 resultados: pregúntale con calidez la edad y los gustos del peque (sin nombrar marcas/productos concretos) para hacer una nueva búsqueda en tu siguiente turno. No incluyas el link del catálogo de ese término. Mantén un tono seguro y servicial, hablando siempre desde lo que vas a hacer por él.
  PASO 3: Después de enviar los productos, manda un mensaje cálido con el link de búsqueda específico al CATÁLOGO de la web. Formato del link: https://ravtoys.com/search?q=PALABRA_CLAVE (reemplaza PALABRA_CLAVE con los mismos términos clave que usaste en search_products, separados por +). Ejemplos:
    - Cliente busca "carro control remoto" → link: https://ravtoys.com/search?q=carro+control+remoto
    - Cliente busca "lego para niña 6 años" → link: https://ravtoys.com/search?q=lego+ni%C3%B1a (los acentos van encodificados: ñ=%C3%B1, á=%C3%A1, é=%C3%A9, í=%C3%AD, ó=%C3%B3, ú=%C3%BA)
    - Cliente busca "muñeca" → link: https://ravtoys.com/search?q=mu%C3%B1eca

  Texto del mensaje (varía la frase, no la copies igual cada vez). DEBE incluir 3 elementos: (a) presentación cálida de las 3 opciones, (b) el link al catálogo de búsqueda, (c) invitación a mandarte links de productos para que tú tomes el pedido. Ejemplo:
  "Te dejo aquí 3 opciones que creo le van a encantar a tu peque 💛 ¿Quieres explorar más? Mira todo el catálogo de [TÉRMINO] aquí 👇\n\n[LINK_DE_BUSQUEDA]\n\nSi alguno te enamora, mándame el link y con muchísimo gusto te tomo el pedido al instante ✨"

  Otras variaciones cálidas (siempre con los 3 elementos):
  - "Estas son mis 3 favoritas para lo que buscas ✨ Si quieres ver muchas más opciones de [TÉRMINO], dale un vistazo aquí 🔍\n\n[LINK]\n\nCuando encuentres el ganador, pégame el link aquí y te lo agrego al carrito al toque 🛒"
  - "Aquí van 3 opciones que pensé te van a gustar 🌟 Tenemos muchísimas más en el catálogo, mira más de [TÉRMINO] aquí 👇\n\n[LINK]\n\nSi alguno te llama la atención, mándame el link y yo te tomo el pedido en un toque 💛"

  PASO 4: Si después el cliente PEGA un link de https://ravtoys.com/products/... (o sea, un producto específico que vio en la web):
    - Extrae las palabras del handle (después de /products/, separado por guiones).
    - Llama search_products con esas palabras.
    - Si lo encuentras, llama select_product_for_purchase con el product_url exacto.
    - Confírmale y pregunta "¿algo más?"

  🔗 LINKS — REGLAS DURAS:
  - NUNCA envuelvas URLs con asteriscos, guiones, comillas o markdown. WhatsApp NO renderiza markdown — el link se ve roto.
  - URL correcto: https://ravtoys.com  ❌ Incorrecto: **ravtoys.com**, *ravtoys.com*, [ravtoys.com](url)
  - Cuando el cliente PEGUE un link de ravtoys.com (ej "https://ravtoys.com/products/super-rocket"):
    1. Extrae palabras del handle (después de /products/, separado por guiones).
    2. Llama search_products con esas palabras.
    3. Si lo encuentras, llama select_product_for_purchase con el product_url exacto.
    4. Confírmale y pregunta "¿algo más?".

  🛒 REGLA DE ORO DEL CROSS-SELL: Después de cada select_product_for_purchase, SIEMPRE pregunta "¿algo más?". El sistema te lo recuerda en next_action.
  Si dice "no, ya está" → pasa al PASO 2.
  Si dice "sí" o pega un link → repite agregar al carrito.

PASO 2 — RECOGER DATOS (uno por uno):
  Pides el dato, esperas la respuesta del cliente, y llamas save_checkout_field con el valor EXACTO que escribió.
  Orden OBLIGATORIO:
  a) save_checkout_field(field="nombre", value="...") — nombre completo
  b) save_checkout_field(field="cedula", value="...") — cédula
  c) save_checkout_field(field="direccion", value="...") — dirección + ciudad
  d) save_checkout_field(field="telefono", value="...") — teléfono de contacto

  Nunca saltes un paso. La cédula es SIEMPRE obligatoria.

PASO 3 — MOSTRAR MEDIOS DE PAGO:
  Cuando los 4 datos estén guardados, llama send_payment_info.

PASO 4 — GUARDAR MÉTODO ELEGIDO:
  save_checkout_field(field="metodo_pago", value="<transferencia|wompi|contraentrega|addi|supay>")

PASO 5 — ENVIAR INSTRUCCIONES DE PAGO:
  send_payment_link(method="<transferencia|wompi|contraentrega|addi|supay>")
  (El sistema usa el precio real del producto, tú no pasas monto)

  El resultado de send_payment_link incluye next_action — SIGUE ESA INSTRUCCIÓN AL PIE DE LA LETRA.

PASO 6 — SEGÚN EL MÉTODO:

  ⭐ WOMPI o TRANSFERENCIA (automatizados):
  Después de send_payment_link, espera silenciosamente a que el cliente diga "ya pagué", "listo", "transferí" o mande comprobante. Cuando confirme:
  → Llama notify_sale_team (sin argumentos)
  → Llama request_human_handoff(reason="venta_cerrada")

  CONTRAENTREGA, ADDI o SÜ PAY (requieren humano para cerrar):
  INMEDIATAMENTE después de send_payment_link, en EL MISMO TURNO:
  → Llama notify_sale_team (sin argumentos)
  → Llama request_human_handoff(reason="venta_metodo_manual")
  No esperes confirmación del cliente. El humano del equipo seguirá la conversación.

═══════════════════════════════════════

HUMANO DIRECTO:
- Si piden hablar con asesor, persona, humano → request_human_handoff(reason="solicitud_cliente").

HORARIOS (solo si preguntan, responde con este formato cool): "🕐 *Nuestros horarios*\n\nDom–Mié: 11:00 am – 8:00 pm\nJue–Sáb: 10:00 am – 9:00 pm\nFestivos: horario de domingo (11am–8pm)\n\n¡Te esperamos! 🌴"

NOTAS DE VOZ:
- Si mandan audio: "No puedo escuchar audio 😊 ¿Me escribes qué buscas?"

NUNCA INVENTES: precios, productos, links, stock, políticas, ni datos del cliente.`;

const TOOLS = [
  {
    name: "search_products",
    description: "Busca productos reales en el catálogo Shopify de RAV Toys. Devuelve hasta 5 con título, precio, image_url, product_url, descripción y stock. Úsalo SIEMPRE que el cliente pida un producto.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Términos cortos (2-4 palabras). Ej: 'muñeca princesa', 'carro control remoto'." }
      },
      required: ["query"]
    }
  },
  {
    name: "send_product_card",
    description: "Envía UNA tarjeta con imagen + nombre + precio + link. Usa los datos EXACTOS que devolvió search_products. Llama 1-3 veces (una por producto) antes de responder texto.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        price: { type: "string" },
        image_url: { type: "string" },
        product_url: { type: "string" }
      },
      required: ["title", "price", "image_url", "product_url"]
    }
  },
  {
    name: "send_store_location",
    description: "Envía la ubicación de Planet Selva. SOLO si preguntan explícitamente por dirección, ubicación o cómo llegar.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "send_payment_info",
    description: "Envía el mensaje con los 4 medios de pago. Úsalo cuando preguntan cómo pagar, o dentro del flujo de checkout después de recoger los datos del cliente.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "send_warranty_info",
    description: "Envía el resumen de garantías. Úsalo cuando mencionan producto dañado, cambio, devolución o garantía.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "send_shipping_info",
    description: "Envía la información de envíos: cobertura, transportadoras y tiempos de entrega. Úsalo cuando el cliente pregunte por envíos, despachos, cobertura, ciudades, transportadoras, cuánto tarda el pedido, o algo similar.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "send_rating_request",
    description: "Envía un mensaje pidiendo al cliente calificar la atención del 1 al 5. Úsalo cuando: (a) el cliente cierra con frases como 'gracias', 'listo', 'todo bien', 'perfecto', 'muchas gracias'; (b) el sistema te indica que el cliente acaba de salir de un handoff con humano. NO lo uses si el cliente está en medio de una compra, búsqueda o garantía.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "save_rating",
    description: "Guarda la calificación del cliente (1 a 5) y notifica al equipo. Llámalo cuando el cliente responda con un número después de send_rating_request. Si dejó comentario, inclúyelo.",
    input_schema: {
      type: "object",
      properties: {
        rating: { type: "integer", minimum: 1, maximum: 5, description: "Calificación de 1 a 5" },
        comment: { type: "string", description: "Comentario opcional del cliente" }
      },
      required: ["rating"]
    }
  },
  {
    name: "save_warranty_field",
    description: "Guarda un dato del flujo de reclamación de garantía. Llámalo cada vez que el cliente provea su número de factura/pedido, cédula/NIT, fecha de compra, o motivo. Una llamada por dato.",
    input_schema: {
      type: "object",
      properties: {
        field: { type: "string", enum: ["factura_pedido", "cedula_nit", "fecha_compra", "motivo"], description: "Cuál dato de garantía estás guardando" },
        value: { type: "string", description: "Valor exacto que dio el cliente" }
      },
      required: ["field", "value"]
    }
  },
  {
    name: "notify_warranty_team",
    description: "Envía resumen de la reclamación al equipo y pasa a humano (Eliana). Llámalo SOLO después de tener los 4 campos: factura_pedido, cedula_nit, fecha_compra y motivo.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "select_product_for_purchase",
    description: "Marca un producto como el elegido por el cliente para la compra. Debe ser un product_url que apareció en un search_products previo. El sistema guarda el producto con su precio REAL (no lo decide el modelo). Usa esta tool al inicio del flujo de checkout.",
    input_schema: {
      type: "object",
      properties: {
        product_url: { type: "string", description: "product_url EXACTO del producto elegido (debe venir de un search_products previo)" }
      },
      required: ["product_url"]
    }
  },
  {
    name: "view_current_purchase",
    description: "Devuelve la lista actual de productos en el carrito del cliente con el total. Úsalo para confirmar al cliente lo que lleva antes de cerrar la compra, o cuando dice 'qué llevo' o 'cuánto va'.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "remove_product_from_purchase",
    description: "Quita UN producto del carrito por su product_url. Úsalo si el cliente cambia de opinión sobre algo que ya había agregado.",
    input_schema: {
      type: "object",
      properties: {
        product_url: { type: "string", description: "product_url EXACTO del producto a quitar" }
      },
      required: ["product_url"]
    }
  },
  {
    name: "save_checkout_field",
    description: "Guarda un campo específico del checkout con su valor. Llámalo después de que el cliente responda cada pregunta del flujo de cierre. Campos permitidos: nombre, cedula, direccion, telefono, metodo_pago.",
    input_schema: {
      type: "object",
      properties: {
        field: {
          type: "string",
          enum: ["nombre", "cedula", "direccion", "telefono", "metodo_pago"],
          description: "Cuál campo estás guardando"
        },
        value: { type: "string", description: "El valor EXACTO que escribió el cliente (sin cambios, ni resumen)" }
      },
      required: ["field", "value"]
    }
  },
  {
    name: "send_payment_link",
    description: "Envía al cliente las instrucciones del método de pago. El sistema usa el precio REAL del producto seleccionado (NO pasas monto, el backend lo calcula).",
    input_schema: {
      type: "object",
      properties: {
        method: {
          type: "string",
          enum: ["transferencia", "wompi", "contraentrega", "addi", "supay"],
          description: "Método elegido por el cliente"
        }
      },
      required: ["method"]
    }
  },
  {
    name: "notify_sale_team",
    description: "Notifica al equipo RAV Toys que hay una venta lista. El sistema arma el resumen con los datos guardados en el checkout (producto, precio real, cliente). TÚ NO PASAS EL RESUMEN. Llámalo después de que el cliente confirme que pagó. Luego llama request_human_handoff.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "request_human_handoff",
    description: "Pasa la conversación a un humano. Úsalo cuando: (a) el cliente pida hablar con una persona, (b) después de notify_sale_team, (c) último recurso cuando no puedas ayudar. Notifica al equipo y detiene el bot para este cliente.",
    input_schema: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Motivo: 'venta_cerrada', 'solicitud_cliente', 'caso_complejo', 'garantia', etc."
        }
      },
      required: ["reason"]
    }
  }
];

async function searchShopify(query) {
  // CACHE (v32): si la misma query se buscó hace <5min, reusar resultado.
  // Ahorra llamadas a Shopify y mejora velocidad. Auto-limpia cada llamada.
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
  const now = Date.now();
  const cached = searchCache.get(query);
  if (cached && (now - cached.ts) < CACHE_TTL_MS) {
    log("info", "search_cache_hit", { query, age_seconds: Math.round((now - cached.ts) / 1000), products: cached.result.products.length });
    return cached.result;
  }
  // Limpiar entries viejas (>10 min) para no acumular memoria
  for (const [k, v] of searchCache.entries()) {
    if ((now - v.ts) > 10 * 60 * 1000) searchCache.delete(k);
  }

  // Estrategia: usar el endpoint público del storefront que devuelve JSON
  // Ventaja: el bot ve exactamente lo mismo que el cliente en la web (filtros de stock,
  // visibilidad y disponibilidad ya aplicados por Shopify). Cero falsos negativos.
  const safeQuery = encodeURIComponent(query || "");
  const url = `https://${SHOPIFY_STORE_DOMAIN.replace('.myshopify.com', '.com').replace('ravtoys.myshopify.com', 'ravtoys.com')}/search?q=${safeQuery}&view=json&resources[limit]=20&type=product`;
  // Fallback: si el dominio personalizado no responde, intentar el .myshopify.com directo
  const fallbackUrl = `https://${SHOPIFY_STORE_DOMAIN}/search?q=${safeQuery}&view=json&resources[limit]=20&type=product`;

  let raw;
  try {
    const resp = await axios.get(url, { timeout: 8000, headers: { Accept: 'application/json' } });
    raw = resp.data;
  } catch (err) {
    console.log(`[searchShopify] Primary URL failed (${err.message}), trying fallback`);
    try {
      const resp = await axios.get(fallbackUrl, { timeout: 8000, headers: { Accept: 'application/json' } });
      raw = resp.data;
    } catch (err2) {
      console.log(`[searchShopify] Fallback also failed: ${err2.message}`);
      return { products: [], total: 0, query };
    }
  }

  // Parsear si llega como string
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch (e) { return { products: [], total: 0, query }; }
  }

  const items = raw?.results || [];
  const total = raw?.results_count || items.length;

  const products = items.map(p => {
    // Extraer handle del URL (lo que va después de /products/)
    const urlPath = p.url || "";
    const handleMatch = urlPath.match(/\/products\/([^?#\/]+)/);
    const handle = handleMatch ? handleMatch[1] : "";
    const fullUrl = urlPath.startsWith('http') ? urlPath : `https://ravtoys.com${urlPath}`;

    return {
      title: p.title || "",
      handle,
      product_url: fullUrl,
      image_url: p.thumbnail || "",
      price: p.price || "",
      product_type: p.type || "",
      available: true,  // El storefront solo devuelve productos disponibles para venta
      stock: 999        // Placeholder: storefront ya filtró agotados
    };
  });

  console.log(`[searchShopify] query="${query}" returned ${products.length} products (storefront says ${total})`);
  const result = { products, total, query };
  searchCache.set(query, { result, ts: Date.now() });
  // ALERTA INTERNA (v33.2): si la búsqueda no encontró nada, avisar al equipo.
  // Esto NO es un error del bot — es info útil: qué buscan los clientes que no tenemos.
  if (products.length === 0) {
    try {
      const now = Date.now();
      const key = (query || "").toLowerCase().trim();
      const last = zeroResultAlerts.get(key) || 0;
      const THIRTY_MIN = 30 * 60 * 1000;
      if (now - last > THIRTY_MIN) {
        zeroResultAlerts.set(key, now);
        log("info", "zero_results_alert", { query });
        notifyTeam(`🔍 Un cliente buscó "${query}" y no encontramos productos. Puede que falte ese producto en el catálogo o que se llame distinto. Vale la pena revisar si conviene agregarlo o si hay un sinónimo.`, null).catch(e => console.error("zero-results alert failed:", e.message));
      }
    } catch (alertErr) {
      console.error("zero-results alert error:", alertErr.message);
    }
  }
  return result;
}


async function sendText(to, text) {
  // INTERCEPTOR (v33.5): blindaje a prueba del modelo, corre tras la generación.
  // (A) EXCUSAS TÉCNICAS — INCONDICIONAL: este bot JAMÁS debe decirle al cliente que tiene
  //     un problema/técnico/despiste/lío. Si aparece, reemplazamos TODO el mensaje por una
  //     respuesta de buen servicio que reconoce que no tenemos eso y ofrece otras opciones.
  // (B) LINK DE CATÁLOGO VACÍO — solo cuando la búsqueda del turno dio 0 resultados.
  if (typeof text === "string") {
    const excusePattern = /t[eé]cnic|despist|inconvenient|se me complic|un (peque[nñ]o )?l[ií]o|dificultad(es)?|no (puedo|logro) (mostrar|cargar|acceder|ver el cat)|(?<!sin |ning[uú]n |no hay )problem/i;
    if (excusePattern.test(text)) {
      log("warn", "blocked_technical_excuse", { to, original: text.slice(0, 140) });
      text = "En este momento no tengo ese exacto en el catálogo, pero con muchísimo gusto te ayudo a encontrar algo perfecto 💛 Cuéntame: ¿qué edad tiene tu peque y qué tipo de juguete le gusta? Así te muestro las mejores opciones que sí tenemos ✨";
      turnZeroSearchActive = false;
    } else if (turnZeroSearchActive) {
      const emptyCatalogLink = /https?:\/\/[^\s]*ravtoys\.com\/search\?q=[^\s]*/i;
      if (emptyCatalogLink.test(text)) {
        log("warn", "blocked_empty_catalog_link", { to, original: text.slice(0, 140) });
        text = "En este momento no tengo eso exacto, pero con gusto te ayudo a encontrar algo ideal 💛 Cuéntame qué edad tiene tu peque y qué tipo de juguete busca, y te muestro las mejores opciones que tenemos ✨";
        turnZeroSearchActive = false;
      }
    }
  }
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      { messaging_product: "whatsapp", to, type: "text", text: { body: text, preview_url: true } },
      { headers: { Authorization: `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" } }
    );
    console.log(`Text sent to ${to}`);
  } catch (err) {
    console.error("WA text error:", err.response?.data?.error || err.message);
  }
}

async function sendImage(to, imageUrl, caption) {
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      { messaging_product: "whatsapp", to, type: "image", image: { link: imageUrl, caption } },
      { headers: { Authorization: `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" } }
    );
    return true;
  } catch (err) {
    console.error("WA image error:", err.response?.data?.error || err.message);
    return false;
  }
}

async function sendLocation(to, lat, lng, name, address) {
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      { messaging_product: "whatsapp", to, type: "location", location: { latitude: lat, longitude: lng, name, address } },
      { headers: { Authorization: `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("WA location error:", err.response?.data?.error || err.message);
  }
}

// Logger estructurado (v32) — formato JSON para futura integración con servicios externos
function log(level, event, data = {}) {
  const entry = { ts: new Date().toISOString(), level, event, ...data };
  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

async function notifyTeam(text, excludePhone) {
  let sent = 0;
  for (const phone of NOTIFICATION_PHONES) {
    if (excludePhone && phone === excludePhone) {
      console.log(`Skipped self-notification to ${phone} (is current customer)`);
      continue;
    }
    try {
      await sendText(phone, text);
      sent++;
    } catch (err) {
      console.log(`[NOTIFY] Failed to send to ${phone}: ${err.message || err}. Continuing with rest.`);
    }
  }
  console.log(`Notified team (${sent}/${NOTIFICATION_PHONES.length} numbers)`);
}

// ─── EXECUTORS ───────────────────────────────────────────────────────────────

async function executeSearchProducts(userId, input) {
  const result = await searchShopify(input.query);
  // Guardar productos mostrados al cliente
  if (result.products && result.products.length > 0) {
    lastSearchResults.set(userId, result.products);
  }
  return result;
}

async function executeSendProductCard(to, input) {
  const caption = `*${input.title}*\n${input.price}\n${input.product_url}`;
  const ok = await sendImage(to, input.image_url, caption);
  if (!ok) await sendText(to, caption);
  console.log(`Card sent: ${input.title} @ ${input.price}`);
  return { sent: true, title: input.title };
}

async function executeSendStoreLocation(to) {
  await sendLocation(to, STORE.latitude, STORE.longitude, STORE.name, STORE.address);
  return { sent: true, store: "Planet Selva" };
}

async function executeSendPaymentInfo(to) {
  await sendText(to, PAYMENT_INFO);
  return { sent: true };
}

async function executeSendWarrantyInfo(to) {
  await sendText(to, WARRANTY_SHORT);
  return { sent: true };
}

async function executeSendShippingInfo(userId) {
  await sendText(userId, SHIPPING_INFO);
  return { sent: true };
}

async function executeSendRatingRequest(userId) {
  await sendText(userId, RATING_REQUEST);
  pendingRatings.add(userId);
  console.log(`[Rating ${userId}] Request sent`);
  return { sent: true, next_action: "Espera la respuesta del cliente con un número 1-5. Cuando responda, llama save_rating con el rating y comment opcional." };
}

async function executeSaveRating(userId, input) {
  const stars = "⭐".repeat(input.rating) + "☆".repeat(5 - input.rating);
  const summary = [
    "📊 *NUEVA CALIFICACIÓN DE ATENCIÓN*",
    "",
    `Calificación: ${input.rating}/5  ${stars}`,
    input.comment ? `Comentario: ${input.comment}` : "(sin comentario)",
    "",
    `📱 WhatsApp del cliente: +${userId}`
  ].join("\n");
  await notifyTeam(summary, userId);
  pendingRatings.delete(userId);
  console.log(`[Rating ${userId}] Saved: ${input.rating}/5${input.comment ? ` - "${input.comment}"` : ""}`);
  const lowRating = input.rating <= 3;
  return {
    saved: true,
    rating: input.rating,
    next_action: lowRating
      ? "Agradece con calidez ('Gracias por tu sinceridad 💛'), pero también ofrece pasarlo con un humano para entender qué podemos mejorar. Si acepta, llama request_human_handoff(reason='rating_bajo')."
      : "Agradécele al cliente con calidez (algo como '¡Mil gracias por calificarnos! Te esperamos pronto en RAV Toys 🌴💛')."
  };
}

async function executeSaveWarrantyField(userId, input) {
  if (!checkouts.has(userId)) checkouts.set(userId, { products: [], data: {} });
  const state = checkouts.get(userId);
  if (!state.warranty) state.warranty = {};
  state.warranty[input.field] = input.value;
  checkouts.set(userId, state);
  const missing = WARRANTY_FIELDS.filter(f => !state.warranty[f]);
  console.log(`[Warranty ${userId}] Saved ${input.field}=${input.value}. Missing: ${missing.join(",") || "none"}`);
  return { saved: input.field, value: input.value, missing_fields: missing };
}

async function executeNotifyWarrantyTeam(userId) {
  const state = checkouts.get(userId);
  if (!state || !state.warranty) {
    return { error: "No hay datos de garantía. Usa save_warranty_field primero." };
  }
  const missing = WARRANTY_FIELDS.filter(f => !state.warranty[f]);
  if (missing.length > 0) {
    return { error: "Faltan datos: " + missing.join(", ") + ". Pídelos antes de notificar." };
  }
  const w = state.warranty;
  const summary = [
    "🛠️ *NUEVA RECLAMACIÓN DE GARANTÍA*",
    "",
    "📄 Factura/Pedido: " + w.factura_pedido,
    "🆔 Cédula/NIT: " + w.cedula_nit,
    "📅 Fecha de compra: " + w.fecha_compra,
    "❓ Motivo: " + w.motivo,
    "",
    "📱 WhatsApp del cliente: +" + userId,
    "",
    "Pendiente: validar condiciones de garantía y dar respuesta al cliente."
  ].join("\n");
  await notifyTeam(summary, userId);
  console.log(`[Warranty ${userId}] Team notified, awaiting handoff`);
  return { notified: true, next_action: "ACCION OBLIGATORIA INMEDIATA: 1) Dile al cliente algo como '¡Listo! Ya pasé tu caso a nuestra asesora Eliana 🌴 Te escribirá pronto para ayudarte 💛'. 2) Llama request_human_handoff(reason='garantia'). NO termines el turno sin estos dos pasos." };
}

async function executeSelectProductForPurchase(userId, input) {
  const products = lastSearchResults.get(userId) || [];
  const chosen = products.find(p => p.product_url === input.product_url);
  if (!chosen) {
    return {
      error: "Producto no encontrado. Debes elegir un product_url que viene del último search_products. Haz un search_products primero si es necesario.",
      available_urls: products.map(p => p.product_url)
    };
  }
  if (!checkouts.has(userId)) checkouts.set(userId, { products: [], data: {} });
  const state = checkouts.get(userId);
  if (!state.products) state.products = [];
  // Si ya está en el carrito, no duplicar
  const existing = state.products.find(p => p.product_url === chosen.product_url);
  if (existing) {
    const total = state.products.reduce((sum, p) => sum + (p.price_amount || 0), 0);
    return {
      already_in_cart: true,
      title: chosen.title,
      cart_count: state.products.length,
      cart_total: `${total.toLocaleString("es-CO")} ${state.products[0].currency}`,
      next_action: "Avísale al cliente que ese producto ya está en el carrito y pregunta si quiere agregar otra cosa."
    };
  }
  state.products.push(chosen);
  checkouts.set(userId, state);
  const total = state.products.reduce((sum, p) => sum + (p.price_amount || 0), 0);
  console.log(`[Checkout ${userId}] Added: ${chosen.title} @ ${chosen.price}. Cart now: ${state.products.length} items, total ${total}`);
  return {
    added: true,
    title: chosen.title,
    price: chosen.price,
    cart_count: state.products.length,
    cart_total: `${total.toLocaleString("es-CO")} ${state.products[0].currency}`,
    next_action: "Pregunta al cliente si quiere agregar algo más a su pedido. Algo como '¡Genial! ¿Quieres agregar otro juguete a tu pedido?'. Si dice que sí, busca otra cosa. Si dice que no, procede a recoger los datos del cliente."
  };
}

async function executeViewCurrentPurchase(userId) {
  const state = checkouts.get(userId);
  if (!state || !state.products || state.products.length === 0) {
    return { empty: true, message: "El cliente aún no ha seleccionado productos." };
  }
  const total = state.products.reduce((sum, p) => sum + (p.price_amount || 0), 0);
  return {
    products: state.products.map(p => ({ title: p.title, price: p.price, product_url: p.product_url })),
    count: state.products.length,
    total: `${total.toLocaleString("es-CO")} ${state.products[0].currency}`
  };
}

async function executeRemoveProductFromPurchase(userId, input) {
  const state = checkouts.get(userId);
  if (!state || !state.products || state.products.length === 0) {
    return { error: "No hay productos en el carrito." };
  }
  const idx = state.products.findIndex(p => p.product_url === input.product_url);
  if (idx === -1) return { error: "Ese producto no está en el carrito." };
  const removed = state.products.splice(idx, 1)[0];
  checkouts.set(userId, state);
  const total = state.products.reduce((sum, p) => sum + (p.price_amount || 0), 0);
  console.log(`[Checkout ${userId}] Removed: ${removed.title}. Cart now: ${state.products.length} items`);
  return {
    removed: true,
    title: removed.title,
    remaining: state.products.length,
    cart_total: state.products.length > 0 ? `${total.toLocaleString("es-CO")} ${state.products[0].currency}` : "$0"
  };
}

async function executeSaveCheckoutField(userId, input) {
  if (!checkouts.has(userId)) checkouts.set(userId, { data: {} });
  const state = checkouts.get(userId);
  if (!state.data) state.data = {};
  if (!state.products || state.products.length === 0) {
    return {
      error: "No hay productos en el carrito. Primero llama select_product_for_purchase con el producto que el cliente quiere comprar."
    };
  }
  state.data[input.field] = input.value;
  checkouts.set(userId, state);
  const missing = CHECKOUT_FIELDS.filter(f => !state.data[f]);
  console.log(`[Checkout ${userId}] Saved ${input.field}=${input.value}. Missing: ${missing.join(",") || "none"}`);
  return {
    saved: input.field,
    value: input.value,
    missing_fields: missing,
    complete: missing.length === 0
  };
}

async function executeSendPaymentLink(userId, input) {
  const state = checkouts.get(userId);
  if (!state || !state.products || state.products.length === 0) {
    return { error: "No hay productos en el carrito. Llama select_product_for_purchase primero." };
  }
  const totalAmount = state.products.reduce((sum, p) => sum + (p.price_amount || 0), 0);
  const currency = state.products[0].currency || "COP";
  const amount = `${totalAmount.toLocaleString("es-CO")} ${currency}`;
  let msg;
  switch (input.method) {
    case "transferencia":
      msg = `💳 *Transferencia Bancolombia*\n\nCuenta de ahorros: *37 938 445 851*\nTitular: RAV Kids SAS\nNIT: 900 822 164-1\n\nMonto a transferir: *${amount}*\n\nCuando tengas el comprobante, me lo envías por aquí y cerramos el pedido. 🙏`;
      break;
    case "wompi":
      msg = `📱 *Pago con tarjeta (Wompi)*\n\nHaz clic aquí para pagar *${amount}*:\nhttps://checkout.wompi.co/l/iGnSPs\n\nEn el checkout coloca el valor exacto y sigue los pasos. Al terminar, avísame por acá. 🙏`;
      break;
    case "contraentrega":
      msg = `🚚 *Pago contraentrega*\n\nPagas *${amount}* en efectivo cuando recibas tu pedido.\n\nSolo disponible para compras menores a $1.450.000. Te confirmamos el envío en un momento. 🎁`;
      break;
    case "addi":
      msg = `📅 *Crédito con Addi*\n\nCompra ahora, paga después, sin intereses. Sujeto a aprobación.\n\nEl equipo te pasará el link de Addi en un momento para que solicites el crédito por *${amount}*.`;
      break;
    case "supay":
      msg = `📅 *Crédito con Sü Pay*\n\nCompra ahora, paga después. Sujeto a aprobación.\n\nEl equipo te pasará el link de Sü Pay en un momento para que solicites el crédito por *${amount}*.`;
      break;
    default:
      msg = `Te paso los detalles de pago por aquí. Monto: ${amount}`;
  }
  await sendText(userId, msg);
  console.log(`[Checkout ${userId}] Payment link sent: ${input.method} for ${amount}`);
  const automatedMethods = ["wompi", "transferencia"];
  const isAutomated = automatedMethods.includes(input.method);
  const next_action = isAutomated
    ? "Espera silenciosamente a que el cliente confirme el pago ('ya pagué', 'listo', 'transferí'). Cuando confirme, llama notify_sale_team y luego request_human_handoff(reason='venta_cerrada')."
    : "ACCION OBLIGATORIA INMEDIATA EN ESTE MISMO TURNO: llama notify_sale_team (sin argumentos) y luego request_human_handoff(reason='venta_metodo_manual'). NO esperes que el cliente diga nada. El humano continuará.";
  return { sent: true, method: input.method, amount, automated: isAutomated, next_action };
}

async function executeNotifyTeam(userId) {
  const state = checkouts.get(userId);
  if (!state || !state.products || state.products.length === 0) {
    return { error: "No hay checkout completo para notificar." };
  }
  const missing = CHECKOUT_FIELDS.filter(f => !state.data?.[f]);
  if (missing.length > 0) {
    return { error: "Faltan campos del cliente: " + missing.join(", ") + ". Pídelos antes de notificar al equipo." };
  }
  const d = state.data;
  const totalAmount = state.products.reduce((sum, p) => sum + (p.price_amount || 0), 0);
  const currency = state.products[0].currency || "COP";
  const formattedTotal = `${totalAmount.toLocaleString("es-CO")} ${currency}`;
  const productsList = state.products.map((p, i) => `  ${i+1}. ${p.title} — ${p.price}\n     ${p.product_url}`).join("\n");
  const summary = [
    "🚨 *NUEVA VENTA CERRADA* 🎉",
    "",
    `📦 Productos (${state.products.length}):`,
    productsList,
    "",
    `💰 *TOTAL: ${formattedTotal}*`,
    "",
    "👤 *Datos del cliente*",
    "Nombre: " + d.nombre,
    "Cédula: " + d.cedula,
    "Dirección: " + d.direccion,
    "Teléfono: " + d.telefono,
    "WhatsApp: +" + userId,
    "",
    "💳 Método de pago: " + d.metodo_pago,
    "",
    "Pendiente: confirmar pago y despachar pedido."
  ].join("\n");
  await notifyTeam(summary, userId);
  console.log(`[Checkout ${userId}] Team notified — ${state.products.length} products, total ${formattedTotal}`);
  return { notified: true, team_size: NOTIFICATION_PHONES.length, products_count: state.products.length };
}

async function executeHumanHandoff(userId, input) {
  humanHandoff.add(userId);
  const reason = input.reason || "solicitud_cliente";
  const state = checkouts.get(userId);
  let notif = `🚨 *Handoff a humano*\nCliente: +${userId}\nMotivo: ${reason}\n\n`;
  if (state?.products && state.products.length > 0 && reason !== "venta_cerrada") {
    if (state.products.length === 1) {
      notif += `(Producto en checkout: ${state.products[0].title} @ ${state.products[0].price})\n\n`;
    } else {
      const total = state.products.reduce((sum, p) => sum + (p.price_amount || 0), 0);
      const currency = state.products[0].currency || "COP";
      notif += `(En checkout: ${state.products.length} productos · Total: ${total.toLocaleString("es-CO")} ${currency})\n\n`;
    }
  }
  notif += "Toma el control en WhatsApp Business.";
  await notifyTeam(notif, userId);
  await sendText(userId, "¡Listo! 🎉 Ya te conecté con alguien del equipo. Te escribirá en unos minutos por este mismo chat. 🙏");
  console.log(`Handoff activated for ${userId}, reason: ${reason}`);
  return { handoff: true, bot_paused: true };
}

// ─── MAIN CONVERSATION LOOP ──────────────────────────────────────────────────


async function handleConversation(userId, userMessage) {
  trackIncomingMessage(userId);
  turnZeroSearchActive = false;  // (v33.4) reset por turno
  turnTools = []; turnZeroQueries = []; turnHandoff = false; turnRating = null;  // (Tarea 1) reset logger
  if (humanHandoff.has(userId)) {
    console.log(`[HANDOFF ACTIVE] Ignoring message from ${userId}`);
    return;
  }

  if (!conversations.has(userId)) conversations.set(userId, []);
  const history = conversations.get(userId);
  history.push({ role: "user", content: userMessage });

  let workingHistory = history.slice(-8);

  let searchedThisTurn = false;
  let lastSearchResultsThisTurn = null;
  for (let iteration = 0; iteration < 8; iteration++) {
    try {
      const response = await axios.post(
        "https://api.anthropic.com/v1/messages",
        {
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 1000,
          system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        ...(pendingRatings.has(userId) ? [{ type: "text", text: "⚠️ NOTA DEL SISTEMA: Cliente acaba de salir de handoff con humano. Pide calificación con send_rating_request ANTES de responder a otra cosa que diga." }] : [])
      ],
          tools: TOOLS.map((t, i) => i === TOOLS.length - 1 ? { ...t, cache_control: { type: "ephemeral" } } : t),
          messages: workingHistory,
        },
        {
          headers: {
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          timeout: 40000,
        }
      );

      const stopReason = response.data.stop_reason;
      trackAnthropicUsage(response.data?.usage);
      const content = response.data.content;

      if (stopReason === "tool_use") {
        const toolUses = content.filter(c => c.type === "tool_use");
        console.log(`Tools: ${toolUses.map(t => t.name).join(", ")}`);
        workingHistory.push({ role: "assistant", content });

        const toolResults = [];
        for (const toolUse of toolUses) {
          turnTools.push(toolUse.name);  // (Tarea 1)
          let result;
          try {
            switch (toolUse.name) {
              case "search_products":
                if (searchedThisTurn) {
                  console.log(`[Cap ${userId}] Blocking second search_products in same turn. Reusing previous results.`);
                  result = lastSearchResultsThisTurn || { products: [], note: "Ya buscaste este turno. Usa los resultados anteriores y respóndele al cliente, no busques otra vez." };
                } else {
                  result = await executeSearchProducts(userId, toolUse.input);
                  console.log(`Search "${toolUse.input.query}": ${result.products?.length || 0} found`);
                  searchedThisTurn = true;
                  lastSearchResultsThisTurn = result;
                  turnZeroSearchActive = (!result || !result.products || result.products.length === 0);  // (v33.4)
                  if (turnZeroSearchActive && result) turnZeroQueries.push(result.query);  // (Tarea 1)
                }
                break;
              case "send_product_card":
                result = await executeSendProductCard(userId, toolUse.input);
                break;
              case "send_store_location":
                result = await executeSendStoreLocation(userId);
                break;
              case "send_payment_info":
                result = await executeSendPaymentInfo(userId);
                break;
              case "send_warranty_info":
                result = await executeSendWarrantyInfo(userId);
                break;
              case "send_shipping_info":
                result = await executeSendShippingInfo(userId);
                break;
              case "send_rating_request":
                result = await executeSendRatingRequest(userId);
                break;
              case "save_rating":
              turnRating = (toolUse.input && (toolUse.input.rating ?? toolUse.input.stars ?? toolUse.input.score)) ?? true;  // (Tarea 1)
                result = await executeSaveRating(userId, toolUse.input);
                break;
              case "save_warranty_field":
                result = await executeSaveWarrantyField(userId, toolUse.input);
                break;
              case "notify_warranty_team":
                result = await executeNotifyWarrantyTeam(userId);
                break;
              case "select_product_for_purchase":
                result = await executeSelectProductForPurchase(userId, toolUse.input);
                break;
              case "view_current_purchase":
                result = await executeViewCurrentPurchase(userId);
                break;
              case "remove_product_from_purchase":
                result = await executeRemoveProductFromPurchase(userId, toolUse.input);
                break;
              case "save_checkout_field":
                result = await executeSaveCheckoutField(userId, toolUse.input);
                break;
              case "send_payment_link":
                result = await executeSendPaymentLink(userId, toolUse.input);
                break;
              case "notify_sale_team":
                result = await executeNotifyTeam(userId);
                break;
              case "request_human_handoff":
              turnHandoff = true;  // (Tarea 1)
                result = await executeHumanHandoff(userId, toolUse.input);
                break;
              default:
                result = { error: "Unknown tool: " + toolUse.name };
            }
          } catch (e) {
            console.error(`Tool ${toolUse.name} error:`, e.message);
            result = { error: e.message };
          }
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          });
        }
        workingHistory.push({ role: "user", content: toolResults });

        if (humanHandoff.has(userId)) {
          conversations.set(userId, history.slice(-8));
          return;
        }
        continue;
      }

      const textBlock = content.find(c => c.type === "text");
      const reply = textBlock ? textBlock.text.trim() : "";
      history.push({ role: "assistant", content: reply || "(sin texto)" });
      conversations.set(userId, history.slice(-8));
      if (reply) recordTurn(userId, userMessage, reply, "ok");
      await sendText(userId, reply);
      return;
    } catch (err) {
      console.error("Claude error:", err.response?.data || err.message);
            botStats.anthropic.failedCalls++;
            // Detectar credit_balance_too_low y alertar al equipo (anti-spam: 1 cada 30 min)
            try {
              const errType = err.response?.data?.error?.type;
              const errMsg = err.response?.data?.error?.message || "";
              const isCreditErr = errType === "invalid_request_error" && /credit|balance/i.test(errMsg);
              if (isCreditErr) {
                const now = Date.now();
                const THIRTY_MIN = 30 * 60 * 1000;
                if (now - lastCreditAlert > THIRTY_MIN) {
                  lastCreditAlert = now;
                  botStats.anthropic.creditErrors++;
                  log("warn", "credit_balance_low_alert", { errMsg });
                  await notifyTeam("⚠️ ALERTA: Saldo de Anthropic agotado. El bot no puede responder a clientes hasta recargar.\n\nRecarga: https://platform.claude.com/settings/billing", null);
                }
              }
            } catch (alertErr) {
              console.error("Failed to send credit alert:", alertErr.message);
            }
      recordTurn(userId, userMessage, "[error interno]", "error");
      await sendText(userId, "Ups, tuve un problemita técnico 😅 ¿Puedes repetir?");
      return;
    }
  }
  recordTurn(userId, userMessage, "[fallback: sin respuesta del modelo]", "fallback");
  await sendText(userId, "Me enredé un poco 😅 ¿Qué buscas exactamente?");
}

// ─── WEBHOOK ─────────────────────────────────────────────────────────────────

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;
    if (!messages || messages.length === 0) return;
    const message = messages[0];
    const from = message.from;
    const type = message.type;

    if (type === "text") {
      const text = message.text.body;
      console.log(`From ${from}: ${text}`);
      await handleConversation(from, text);
    } else if (type === "audio" || type === "voice") {
      console.log(`From ${from}: [voice note]`);
      if (!humanHandoff.has(from)) {
        await sendText(from, "No puedo escuchar audio 😊 ¿Me escribes qué buscas?");
      }
    } else if (type === "image" || type === "document") {
      console.log(`From ${from}: [${type}] (possibly payment proof)`);
    } else {
      console.log(`From ${from}: [${type}]`);
      if (!humanHandoff.has(from)) {
        await sendText(from, "Solo puedo leer texto por ahora 😊 ¿En qué te ayudo?");
      }
    }
  } catch (err) {
    console.error("Error processing message:", err);
  }
});

// ─── ADMIN ENDPOINTS ─────────────────────────────────────────────────────────

app.get("/admin/release/:userId", (req, res) => {
  const userId = req.params.userId;
  const wasActive = humanHandoff.delete(userId);
  pendingRatings.add(userId);
  console.log(`[ADMIN] Released ${userId} (was handoff: ${wasActive})`);
  res.json({ ok: true, userId, wasInHandoff: wasActive });
});

app.get("/admin/reset-checkout/:userId", (req, res) => {
  const userId = req.params.userId;
  const had = checkouts.delete(userId);
  res.json({ ok: true, userId, hadCheckout: had });
});

app.get("/admin/status", (req, res) => {
  res.json({
    activeHandoffs: [...humanHandoff],
    activeCheckouts: [...checkouts.entries()].map(([k, v]) => ({
      userId: k,
      products: v.products?.map(p => ({title: p.title, price: p.price})) || [],
      total_amount: (v.products || []).reduce((sum, p) => sum + (p.price_amount || 0), 0),
      data: v.data
    })),
    conversationCount: conversations.size,
  });
});

app.get("/", (req, res) => {
  res.send("RAV-Bot v36.4 (Sonnet 4.5, dashboard redesign + customizable logo)");
});

const PORT = process.env.PORT || 3000;

// ─── ADMIN ENDPOINTS (added in v31 — observability + safety net) ────
// Health check: verifica que dependencias externas respondan, sin gastar
// créditos de Anthropic. Útil antes de hacer pruebas o deploys.
app.get("/admin/dashboard", (req, res) => {
  if (req.query.key !== DASHBOARD_KEY) {
    res.status(401).send("<html><body style='font-family:sans-serif;text-align:center;padding:60px;color:#444'><h2>Acceso restringido</h2><p>Agrega tu clave a la URL: <code>/admin/dashboard?key=TU_CLAVE</code></p></body></html>");
    return;
  }
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.send(`
<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Panel RAV Toys</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js"></script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#F4F5F7;color:#1F2A44;padding:22px;line-height:1.5}
.wrap{max-width:1000px;margin:0 auto}
.headcard{background:#fff;border:0.5px solid #E5E8EC;border-radius:12px;padding:14px 18px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px}
.brand{display:flex;align-items:center;gap:12px}
.logo{width:42px;height:42px;border-radius:10px;background:#E1F5EE;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#0F6E56;cursor:pointer;overflow:hidden;position:relative}
.logo img{width:100%;height:100%;object-fit:cover}
.logo .pencil{position:absolute;right:-3px;bottom:-3px;width:16px;height:16px;border-radius:50%;background:#1F2A44;color:#fff;font-size:9px;display:flex;align-items:center;justify-content:center}
.brand h1{font-size:16px;font-weight:600}
.brand p{font-size:12px;color:#9AA0A6}
.btns{display:flex;gap:8px}
.btn{font-size:12px;color:#2E8B8B;cursor:pointer;border:1px solid #cfe3e3;background:#fff;padding:6px 14px;border-radius:8px}
.btn:hover{background:#F0FAF7}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:12px}
.kpi{background:#fff;border-radius:12px;padding:14px 16px;border:0.5px solid #E5E8EC}
.kpi .top{display:flex;align-items:center;gap:8px}
.chip{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:15px}
.kpi .lbl{font-size:12px;color:#6B7280}
.kpi .val{font-size:27px;font-weight:600;margin-top:8px}
.kpi .sub{font-size:11px;color:#9AA0A6;margin-top:2px}
.mini{background:#fff;border-radius:12px;padding:12px 16px;border:0.5px solid #E5E8EC;display:flex;align-items:center;justify-content:space-between}
.mini .lbl{font-size:12px;color:#6B7280}
.mini .val{font-size:21px;font-weight:600;margin-top:2px}
.accent{width:6px;height:36px;border-radius:3px;background:#D3D1C7}
.charts{display:grid;grid-template-columns:1.4fr 1fr;gap:14px;margin-bottom:14px}
.panel{background:#fff;border-radius:12px;padding:16px 18px;border:0.5px solid #E5E8EC}
.panel h3{font-size:14px;font-weight:600;margin-bottom:10px}
.badge{font-size:11px;color:#9AA0A6;background:#F4F5F7;padding:3px 10px;border-radius:10px}
.legend{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px;font-size:11px;color:#6B7280}
.legend span{display:flex;align-items:center;gap:4px}
.dot{width:9px;height:9px;border-radius:2px;display:inline-block}
.tip{background:#E1F5EE;border-radius:12px;padding:14px 18px}
.tip h3{font-size:14px;font-weight:600;color:#085041;margin-bottom:4px}
.tip p{font-size:13px;color:#0F6E56;line-height:1.6}
.cv{position:relative;width:100%;height:190px}
.cv.sm{height:150px}
.center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none}
@media(max-width:760px){.charts{grid-template-columns:1fr}}
</style></head><body><div class="wrap">
<div class="headcard"><div class="brand"><div class="logo" id="logo" onclick="changeLogo()" title="Clic para cambiar el logo">RAV<div class="pencil">&#9998;</div></div><div><h1>RAV Toys · Panel del bot</h1><p id="meta">cargando datos...</p></div></div><div class="btns"><div class="btn" id="evalBtn" onclick="runEval()">&#10024; Evaluar ahora</div><div class="btn" onclick="location.reload()">&#8635; Actualizar</div></div></div>
<div class="grid">
<div class="kpi"><div class="top"><div class="chip" style="background:#E1F5EE">&#128101;</div><span class="lbl">Clientes atendidos</span></div><div class="val" id="m-users">-</div><div class="sub" id="s-users"></div></div>
<div class="kpi"><div class="top"><div class="chip" style="background:#E6F1FB">&#128722;</div><span class="lbl">Pedidos iniciados</span></div><div class="val" id="m-orders">-</div><div class="sub">productos seleccionados</div></div>
<div class="kpi"><div class="top"><div class="chip" style="background:#FAEEDA">&#128202;</div><span class="lbl">Conversión</span></div><div class="val" id="m-conv">-</div><div class="sub" id="s-conv"></div></div>
<div class="kpi"><div class="top"><div class="chip" style="background:#FAECE7">&#11088;</div><span class="lbl">Rating promedio</span></div><div class="val" id="m-rating">-</div><div class="sub" id="s-rating"></div></div>
</div>
<div class="grid">
<div class="mini"><div><div class="lbl">Tasa de resolución</div><div class="val" id="m-res">-</div></div><div class="accent" id="a-res"></div></div>
<div class="mini"><div><div class="lbl">Pasó a humano</div><div class="val" id="m-hand">-</div></div><div class="accent" id="a-hand"></div></div>
<div class="mini"><div><div class="lbl">Búsqueda exitosa</div><div class="val" id="m-search">-</div></div><div class="accent" id="a-search"></div></div>
<div class="mini"><div><div class="lbl">Costo / chat</div><div class="val" id="m-cost">-</div></div><div class="accent" id="a-cost"></div></div>
</div>
<div class="charts">
<div class="panel"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px"><h3 style="margin:0">Actividad por día</h3><span class="badge" id="dayBadge"></span></div><div class="cv"><canvas id="chDay"></canvas></div></div>
<div class="panel"><h3>Resultado de conversaciones</h3><div class="cv sm"><canvas id="chOut"></canvas><div class="center"><div style="font-size:21px;font-weight:600" id="donutTotal">0</div><div style="font-size:11px;color:#9AA0A6">chats</div></div></div><div class="legend" id="legOut"></div></div>
</div>
<div class="panel" style="margin-bottom:14px"><h3 style="margin-bottom:2px">&#128230; Búsquedas sin resultados</h3><div style="font-size:12px;color:#9AA0A6;margin-bottom:10px">Lo que tus clientes pidieron y no encontraron — oportunidades de inventario</div><div class="cv"><canvas id="chGap"></canvas></div></div>
<div class="tip"><h3>&#128161; Aprendizajes</h3><p id="learn">Aún no hay suficientes datos evaluados. Usa el botón Evaluar ahora cuando haya conversaciones.</p></div>
</div>
<script>
var TEAL="#1D9E75",AMBER="#EF9F27",CORAL="#D85A30",BLUE="#378ADD",GOOD="#5DCAA5",WARN="#FAC775",NEUTRAL="#D3D1C7";
function pct(n,d){return d?Math.round(n/d*100)+"%":"-";}
function initLogo(){var el=document.getElementById("logo");var url=null;try{url=localStorage.getItem("rav_logo");}catch(e){}if(url){el.innerHTML="<img src='"+url+"' alt='logo'><div class='pencil'>&#9998;</div>";}}
function changeLogo(){var cur="";try{cur=localStorage.getItem("rav_logo")||"";}catch(e){}var url=prompt("Pega la URL de la imagen de tu logo (deja vacío para volver al texto RAV):",cur);if(url===null)return;try{if(url.trim()===""){localStorage.removeItem("rav_logo");document.getElementById("logo").innerHTML="RAV<div class='pencil'>&#9998;</div>";}else{localStorage.setItem("rav_logo",url.trim());initLogo();}}catch(e){}}
function runEval(){var b=document.getElementById("evalBtn");if(b){b.textContent="Evaluando...";b.style.opacity="0.6";}fetch("/admin/evaluate?limit=30").then(function(r){return r.json();}).then(function(){location.reload();}).catch(function(){if(b){b.textContent="Error, reintenta";b.style.opacity="1";}});}
function go(){
Promise.all([fetch("/admin/stats").then(function(r){return r.json();}),fetch("/admin/conversations?limit=100").then(function(r){return r.json();})]).then(function(res){render(res[0],res[1]);}).catch(function(e){document.getElementById("meta").textContent="error cargando datos";});
}
function render(stats,conv){
var ct=(stats.counters)||{},an=(stats.anthropic)||{},sm=(conv.summary)||{},turns=(conv.turns)||[];
var clientes=ct.unique_users_total||0;var msgs=ct.messages_received_total||0;
var hora=new Date().toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"});
document.getElementById("meta").textContent=(msgs===0?"Aún sin conversaciones — el panel se llenará cuando lleguen clientes":(msgs+" mensajes · "+clientes+" clientes"))+" · "+(stats.bot_version||"")+" · actualizado "+hora;
var orderUsers={};turns.forEach(function(t){if(t.tools&&t.tools.indexOf("select_product_for_purchase")>=0){orderUsers[t.userId]=1;}});
var pedidos=Object.keys(orderUsers).length;
document.getElementById("m-users").textContent=clientes;
document.getElementById("s-users").textContent=(ct.unique_users_today||0)+" hoy";
document.getElementById("m-orders").textContent=pedidos;
document.getElementById("m-conv").textContent=pct(pedidos,clientes);
document.getElementById("s-conv").textContent=pedidos+" de "+clientes+" clientes";
var rating=sm.avg_rating;document.getElementById("m-rating").innerHTML=(rating!=null?rating:"-")+"<span style='font-size:14px;color:#9AA0A6'> / 5</span>";
document.getElementById("s-rating").textContent=(sm.ratings_count||0)+" calificaciones";
var evald=turns.filter(function(t){return t.eval&&!t.eval.error;});
var si=evald.filter(function(t){return t.eval.resuelto==="si";}).length;
var parc=evald.filter(function(t){return t.eval.resuelto==="parcial";}).length;
var resPct=evald.length?Math.round(si/evald.length*100):null;
document.getElementById("m-res").textContent=resPct!=null?resPct+"%":"-";
document.getElementById("a-res").style.background=resPct==null?NEUTRAL:(resPct>=70?GOOD:WARN);
var handT=turns.filter(function(t){return t.handoff;}).length;
var handPct=turns.length?Math.round(handT/turns.length*100):null;
document.getElementById("m-hand").textContent=handPct!=null?handPct+"%":"-";
document.getElementById("a-hand").style.background=handPct==null?NEUTRAL:(handPct<=25?BLUE:WARN);
var searchT=turns.filter(function(t){return t.tools&&t.tools.indexOf("search_products")>=0;}).length;
var zeroT=turns.filter(function(t){return t.zeroResultQueries&&t.zeroResultQueries.length>0;}).length;
var searchPct=searchT?Math.round((searchT-zeroT)/searchT*100):null;
document.getElementById("m-search").textContent=searchPct!=null?searchPct+"%":"-";
document.getElementById("a-search").style.background=searchPct==null?NEUTRAL:(searchPct>=85?GOOD:WARN);
var costTotal=an.estimated_cost_usd||0;var costChat=clientes?costTotal/clientes:0;
document.getElementById("m-cost").textContent="$"+costChat.toFixed(3);
document.getElementById("a-cost").style.background=clientes===0?NEUTRAL:(costChat<=0.10?GOOD:WARN);
var byDay=ct.messages_by_day||{};var days=Object.keys(byDay).sort();
document.getElementById("dayBadge").textContent=days.length?("últimos "+days.length+" días"):"sin datos";
new Chart(document.getElementById("chDay"),{type:"bar",data:{labels:days.map(function(d){return d.slice(5);}),datasets:[{data:days.map(function(d){return byDay[d];}),backgroundColor:"rgba(29,158,117,0.25)",borderColor:TEAL,borderWidth:{top:2,left:0,right:0,bottom:0},borderRadius:5,barPercentage:0.65}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{precision:0},grid:{color:"rgba(136,135,128,0.12)"}},x:{grid:{display:false}}}}});
var oc;
if(evald.length){oc=[["Resueltas",si,TEAL],["Parciales",parc,AMBER],["A humano",handT,BLUE]];}
else{oc=[["Atendidas",Math.max(turns.length-handT,0),TEAL],["A humano",handT,BLUE]];}
var ocTotal=0;oc.forEach(function(o){ocTotal+=o[1];});
document.getElementById("donutTotal").textContent=turns.length;
var legHtml="";oc.forEach(function(o){var p=ocTotal?Math.round(o[1]/ocTotal*100):0;legHtml+="<span><span class='dot' style='background:"+o[2]+"'></span>"+o[0]+" "+p+"%</span>";});
document.getElementById("legOut").innerHTML=legHtml;
new Chart(document.getElementById("chOut"),{type:"doughnut",data:{labels:oc.map(function(o){return o[0];}),datasets:[{data:oc.map(function(o){return o[1];}),backgroundColor:oc.map(function(o){return o[2];}),borderWidth:2,borderColor:"rgba(255,255,255,0.9)",hoverOffset:6}]},options:{responsive:true,maintainAspectRatio:false,cutout:"70%",plugins:{legend:{display:false}}}});
var gaps={};turns.forEach(function(t){(t.zeroResultQueries||[]).forEach(function(q){q=(q||"").toLowerCase().trim();if(q){gaps[q]=(gaps[q]||0)+1;}});});
var gArr=Object.keys(gaps).map(function(k){return [k,gaps[k]];}).sort(function(a,b){return b[1]-a[1];}).slice(0,6);
var gColors=gArr.map(function(g,idx){return idx===0?"#D85A30":(idx<3?"#F0997B":"#F5C4B3");});
new Chart(document.getElementById("chGap"),{type:"bar",data:{labels:gArr.map(function(g){return g[0];}),datasets:[{data:gArr.map(function(g){return g[1];}),backgroundColor:gColors,borderRadius:5,barThickness:20}]},options:{indexAxis:"y",responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,ticks:{precision:0},grid:{color:"rgba(136,135,128,0.12)"}},y:{grid:{display:false}}}}});
var sugs=evald.map(function(t){return t.eval.sugerencia;}).filter(function(s){return s&&s.length>3;}).slice(0,3);
if(sugs.length){document.getElementById("learn").textContent=sugs.join("  ·  ");}
else if(gArr.length){document.getElementById("learn").textContent="Tus clientes buscaron "+gArr[0][0]+" ("+gArr[0][1]+" veces) sin resultados. Considera agregarlo al catálogo o mapear el término.";}
}
initLogo();go();setInterval(go,60000);
</script>
</body></html>`);
});

app.get("/admin/health", async (req, res) => {
  const result = {
    bot: { version: BOT_VERSION, uptime_seconds: Math.round(process.uptime()) },
    env: {
      anthropic_key_present: !!ANTHROPIC_API_KEY,
      shopify_token_present: !!SHOPIFY_ADMIN_TOKEN,
      wa_token_present: !!WA_TOKEN,
      phone_number_id: PHONE_NUMBER_ID,
      shopify_domain: SHOPIFY_STORE_DOMAIN,
      notification_phones_count: NOTIFICATION_PHONES.length
    },
    state: {
      active_handoffs: humanHandoff.size,
      pending_ratings: pendingRatings.size,
      active_checkouts: checkouts.size,
      conversations_in_memory: conversations.size,
      last_search_results_cached: lastSearchResults.size
    },
    checks: {}
  };
  // Probar Shopify storefront search (gratis, no consume saldo)
  try {
    const r = await axios.get(`https://ravtoys.com/search?q=test&view=json&resources[limit]=1&type=product`, { timeout: 5000 });
    result.checks.shopify_storefront = r.status === 200 ? "ok" : `status_${r.status}`;
  } catch (e) {
    result.checks.shopify_storefront = `error: ${e.message}`;
  }
  // Probar Meta WhatsApp API (verifica que el token siga válido)
  try {
    const r = await axios.get(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}`, {
      headers: { Authorization: `Bearer ${WA_TOKEN}` },
      timeout: 5000
    });
    result.checks.meta_whatsapp = r.status === 200 ? "ok" : `status_${r.status}`;
  } catch (e) {
    result.checks.meta_whatsapp = `error: ${e.response?.data?.error?.message || e.message}`;
  }
  result.checks.shopify_admin_api = SHOPIFY_ADMIN_TOKEN ? "key_present_not_tested" : "missing_key";
  result.checks.anthropic_api = ANTHROPIC_API_KEY ? "key_present_not_tested_to_save_credits" : "missing_key";
  res.json(result);
});

// Stats con contadores persistentes (v33)
// ─── AUTO-EVALUACIÓN (Tarea 2) ────────────────────────────────────────
// Evalúa cada interacción con Claude y devuelve KPIs: resuelto, tono,
// intención de compra, aciertos, errores y sugerencia. Corre BAJO DEMANDA
// desde /admin/evaluate (no en cada mensaje) para no encarecer cada chat.
async function evaluateTurn(turn) {
  const sys = "Eres un evaluador de calidad de un bot de ventas de juguetería por WhatsApp (RAV Toys, Medellín). Evalúa UNA interacción: el mensaje del cliente y la respuesta del bot. Sé objetivo y breve. Responde SOLO con JSON válido, sin texto adicional, sin markdown, sin explicaciones.";
  const userMsg = [
    'Mensaje del cliente: "' + (turn.userMessage || "") + '"',
    'Respuesta del bot: "' + (turn.botReply || "") + '"',
    "Herramientas usadas: " + ((turn.tools && turn.tools.length) ? turn.tools.join(", ") : "ninguna"),
    "Búsquedas sin resultados: " + ((turn.zeroResultQueries && turn.zeroResultQueries.length) ? turn.zeroResultQueries.join(", ") : "ninguna"),
    "Pasó a humano: " + (turn.handoff ? "sí" : "no"),
    "Rating del cliente: " + (turn.rating != null ? turn.rating : "ninguno"),
    "",
    "Evalúa y responde SOLO este JSON (sin nada más):",
    '{"resuelto":"si|no|parcial","tono":1,"intencion_compra":false,"aciertos":"máx 12 palabras","errores":"máx 12 palabras","sugerencia":"máx 15 palabras"}'
  ].join("\n");

  const resp = await axios.post("https://api.anthropic.com/v1/messages", {
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 300,
    system: sys,
    messages: [{ role: "user", content: userMsg }]
  }, {
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    timeout: 20000
  });
  trackAnthropicUsage(resp.data && resp.data.usage);
  let txt = "";
  const blocks = (resp.data && resp.data.content) || [];
  for (const b of blocks) { if (b.type === "text") txt += b.text; }
  txt = txt.replace(/\`\`\`json|\`\`\`/g, "").trim();
  const parsed = JSON.parse(txt);
  return {
    resuelto: String(parsed.resuelto || "").toLowerCase(),
    tono: Number(parsed.tono) || null,
    intencion_compra: !!parsed.intencion_compra,
    aciertos: String(parsed.aciertos || "").slice(0, 160),
    errores: String(parsed.errores || "").slice(0, 160),
    sugerencia: String(parsed.sugerencia || "").slice(0, 200),
    evaluatedAt: new Date().toISOString()
  };
}

// Endpoint: evalúa bajo demanda los turnos que aún no tienen evaluación.
// ?limit=N (default 10, máx 30) para controlar costo/tiempo por corrida.
app.get("/admin/evaluate", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 30);
  const pending = conversationLogs.filter(t => !t.eval);
  const batch = pending.slice(0, limit);
  let evaluated = 0, failed = 0;
  for (const turn of batch) {
    try {
      turn.eval = await evaluateTurn(turn);
      evaluated++;
    } catch (e) {
      turn.eval = { error: true, message: (e.message || "eval failed").slice(0, 120) };
      failed++;
      log("error", "eval_failed", { error: e.message });
    }
  }
  // KPIs agregados sobre TODO lo evaluado hasta ahora
  const done = conversationLogs.filter(t => t.eval && !t.eval.error);
  const resByCat = { si: 0, parcial: 0, no: 0 };
  let tonoSum = 0, tonoN = 0, intentN = 0;
  for (const t of done) {
    if (t.eval.resuelto && resByCat[t.eval.resuelto] != null) resByCat[t.eval.resuelto]++;
    if (t.eval.tono) { tonoSum += t.eval.tono; tonoN++; }
    if (t.eval.intencion_compra) intentN++;
  }
  const total = done.length;
  res.json({
    bot_version: BOT_VERSION,
    run: { evaluated_now: evaluated, failed_now: failed, pending_remaining: pending.length - batch.length },
    kpis: {
      total_evaluadas: total,
      tasa_resolucion: total ? Math.round((resByCat.si / total) * 100) + "%" : "—",
      resueltas_si: resByCat.si,
      resueltas_parcial: resByCat.parcial,
      resueltas_no: resByCat.no,
      tono_promedio: tonoN ? Math.round((tonoSum / tonoN) * 10) / 10 : null,
      tasa_intencion_compra: total ? Math.round((intentN / total) * 100) + "%" : "—"
    },
    note: "Evaluación bajo demanda. Llama de nuevo para procesar el siguiente lote. Los resultados se ven por turno en /admin/conversations (campo eval).",
    evaluated_sample: batch.map(t => ({ userMessage: t.userMessage, eval: t.eval }))
  });
});

app.get("/admin/conversations", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const recent = conversationLogs.slice(-limit).reverse();
  const withRating = conversationLogs.filter(t => t.rating != null);
  const avgRating = withRating.length
    ? Math.round(withRating.reduce((s, t) => s + (Number(t.rating) || 0), 0) / withRating.length * 10) / 10
    : null;
  res.json({
    bot_version: BOT_VERSION,
    total_logged: conversationLogs.length,
    summary: {
      turns_logged: conversationLogs.length,
      turns_with_zero_results: conversationLogs.filter(t => t.zeroResultQueries.length > 0).length,
      turns_with_handoff: conversationLogs.filter(t => t.handoff).length,
      turns_with_error: conversationLogs.filter(t => t.status !== "ok").length,
      ratings_count: withRating.length,
      avg_rating: avgRating,
      turns_evaluated: conversationLogs.filter(t => t.eval && !t.eval.error).length,
      turns_pending_eval: conversationLogs.filter(t => !t.eval).length
    },
    note: "Log en memoria (últimas 100 vueltas). Se reinicia cuando el bot duerme. Conectar Google Sheets para guardado permanente.",
    turns: recent
  });
});

app.get("/admin/stats", (req, res) => {
  const handoffsList = Array.from(humanHandoff.values());
  const pendingList = Array.from(pendingRatings.values());
  const checkoutsList = Array.from(checkouts.entries()).map(([userId, cart]) => ({
    user: userId,
    products: cart.products?.length || 0,
    has_warranty: !!(cart.warranty && Object.keys(cart.warranty).length > 0)
  }));
  const cachingActive = botStats.anthropic.cacheReadTokens > 0 || botStats.anthropic.cacheCreationTokens > 0;
  const cacheHitRatio = botStats.anthropic.inputTokens > 0
    ? (botStats.anthropic.cacheReadTokens / (botStats.anthropic.inputTokens + botStats.anthropic.cacheReadTokens) * 100).toFixed(1) + '%'
    : '0%';
  res.json({
    bot_version: BOT_VERSION,
    timestamp: new Date().toISOString(),
    counters: {
      uptime_started_at: botStats.startedAt,
      messages_received_total: botStats.messages.total,
      messages_received_today: botStats.messages.today,
      messages_by_day: botStats.messages.byDay,
      unique_users_total: botStats.uniqueUsers.size,
      unique_users_today: botStats.uniqueUsersToday.set.size
    },
    anthropic: {
      total_calls: botStats.anthropic.totalCalls,
      failed_calls: botStats.anthropic.failedCalls,
      credit_errors: botStats.anthropic.creditErrors,
      input_tokens: botStats.anthropic.inputTokens,
      output_tokens: botStats.anthropic.outputTokens,
      cache_creation_tokens: botStats.anthropic.cacheCreationTokens,
      cache_read_tokens: botStats.anthropic.cacheReadTokens,
      caching_active: cachingActive,
      cache_hit_ratio: cacheHitRatio,
      estimated_cost_usd: estimateCostUSD()
    },
    current_state: {
      active_handoffs: humanHandoff.size,
      pending_ratings: pendingRatings.size,
      active_carts: checkouts.size,
      conversations_in_memory: conversations.size
    },
    active_handoff_users: handoffsList,
    pending_rating_users: pendingList,
    active_checkouts: checkoutsList,
    note: "Counters reset when bot restarts (free tier sleeps after 15min)."
  });
});

// Test search: yo (Claude) lo uso ANTES de avisarte que cambios de búsqueda
// están listos. Te permite verificar tú mismo abriendo una URL.
app.get("/admin/test-search", async (req, res) => {
  const q = req.query.q || "";
  if (!q) {
    res.status(400).json({ error: "Missing query param: ?q=..." });
    return;
  }
  try {
    const result = await searchShopify(q);
    res.json({
      query: q,
      total: result.total,
      products_returned: result.products.length,
      products: result.products.map(p => ({
        title: p.title,
        price: p.price,
        product_url: p.product_url,
        product_type: p.product_type
      }))
    });
  } catch (e) {
    res.status(500).json({ query: q, error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`RAV-Bot v36.4 (Sonnet 4.5, dashboard redesign + customizable logo) running on port ${PORT}`);
  console.log(`WA: ${WA_TOKEN ? "OK" : "MISSING"}`);
  console.log(`Anthropic: ${ANTHROPIC_API_KEY ? "OK" : "MISSING"}`);
  console.log(`Shopify: ${SHOPIFY_ADMIN_TOKEN ? "OK " + SHOPIFY_STORE_DOMAIN : "MISSING"}`);
  console.log(`Notifications: ${NOTIFICATION_PHONES.join(", ")}`);
});
