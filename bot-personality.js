"use strict";

const { normalizeShippingPricing } = require("./checkout-shipping");

const RESPONSE_LENGTHS = Object.freeze(["muy_breve", "breve", "detallada"]);
const GREETING_TONES = Object.freeze(["cercano", "formal", "directo"]);
const EMOJI_LEVELS = Object.freeze(["ninguno", "pocos", "moderados"]);
const PRICE_MODES = Object.freeze(["exact", "range", "human"]);
const REMINDER_TYPES = Object.freeze(["reservation", "virtual", "home"]);
const PAYMENT_METHODS = Object.freeze(["nequi_daviplata", "transfer", "cash_on_delivery", "payment_link", "card"]);
const ESCALATION_TRIGGERS = Object.freeze([
  "customer_requests",
  "customer_upset",
  "three_failed_attempts",
  "claim_or_warranty",
  "special_discount",
  "unknown_answer"
]);
const SHIPPING_SUGGESTIONS = Object.freeze([
  ["neighborhood", "Barrio o localidad"],
  ["delivery_window", "Franja horaria de entrega"],
  ["shipping_email", "Correo para la guía"],
  ["cash_on_delivery", "¿Paga contraentrega?"],
  ["landmark", "Punto de referencia"],
  ["billing_details", "Datos de facturación"]
]);

const BOT_CONFIGURATION_CONTRACT = Object.freeze({
  response_length: "prompt",
  emoji_level: "prompt",
  "profile.avatar_url": "whatsapp_profile",
  "profile.display_name": "prompt_and_whatsapp_display_name_request",
  "profile.description": "prompt_and_whatsapp_profile",
  "greeting.tone": "editor_state",
  "greeting.selected": "editor_state",
  "greeting.custom": "editor_state",
  "greeting.text": "prompt",
  "business.hours": "prompt",
  "business.address": "prompt_and_whatsapp_profile",
  "business.returns_policy": "prompt",
  "business.out_of_hours_notice": "prompt",
  "shipping.fields": "prompt",
  "shipping.pricing_mode": "prompt_and_checkout",
  "shipping.flat_fee_cop": "prompt_and_checkout",
  "shipping.free_over_cop": "prompt_and_checkout",
  "shipping.policy": "prompt_and_checkout",
  "reminders.type": "prompt",
  "reminders.selected": "editor_state",
  "reminders.custom": "editor_state",
  "reminders.text": "prompt",
  "reminders.timings": "prompt",
  "reminders.allow_confirm_cancel": "prompt",
  "catalog.price_mode": "prompt",
  "catalog.out_of_stock_message": "prompt",
  "payments.methods": "prompt",
  "payments.confirmation_message": "prompt",
  faqs: "prompt",
  "escalation.triggers": "prompt",
  "escalation.notify_contact": "prompt",
  "farewell.tone": "editor_state",
  "farewell.selected": "editor_state",
  "farewell.custom": "editor_state",
  "farewell.text": "prompt",
  preferred_words: "prompt",
  avoided_words: "prompt",
  custom_instructions: "prompt",
  extra_context: "prompt"
});

function cleanText(value, max) {
  return String(value == null ? "" : value)
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, max || 5000);
}

function cleanAvatarImage(value) {
  const clean = String(value == null ? "" : value).trim();
  if (!clean) return "";
  if (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(clean)) {
    return clean.length <= 90000 ? clean : "";
  }
  try {
    const url = new URL(clean);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    return clean.slice(0, 1200);
  } catch (_) {
    return "";
  }
}

function cleanChoice(value, allowed, fallback) {
  const clean = cleanText(value, 80).toLowerCase();
  return allowed.includes(clean) ? clean : fallback;
}

function cleanBoolean(value, fallback) {
  return typeof value === "boolean" ? value : !!fallback;
}

function uniqueChoices(value, allowed, fallback) {
  const source = Array.isArray(value) ? value : fallback;
  return Array.from(new Set((source || []).map(function (item) {
    return cleanText(item, 80).toLowerCase();
  }).filter(function (item) {
    return allowed.includes(item);
  })));
}

function planSlug(planId) {
  const value = cleanText(planId, 80).toLowerCase().replace(/^nextfor[-_]/, "");
  return ["uno", "aura", "tempo", "atlas"].includes(value) ? value : "uno";
}

function planFeatures(planId) {
  const plan = planSlug(planId);
  return {
    plan,
    shipping: plan === "aura" || plan === "atlas",
    catalog: plan === "aura" || plan === "atlas",
    payments: plan !== "uno",
    reminders: plan === "tempo" || plan === "atlas"
  };
}

function setupTone(value) {
  const tone = cleanText(value, 80).toLowerCase();
  if (["formal_corporativo", "premium", "formal"].includes(tone)) return "formal";
  if (["vendedor_dinamico", "juvenil_casual", "directo"].includes(tone)) return "directo";
  return "cercano";
}

function greetingProposals(tone, businessName) {
  const name = cleanText(businessName, 120) || "{negocio}";
  return {
    cercano: [
      "¡Hola! 👋 Soy el asistente de " + name + ". Cuéntame qué estás buscando y te ayudo enseguida.",
      "¡Hola, {nombre}! Bienvenido a " + name + " 🙌 ¿En qué te puedo ayudar hoy?"
    ],
    formal: [
      "Buen día. Le saluda el asistente de " + name + ". ¿En qué podemos ayudarle?",
      "Bienvenido a " + name + ". Estoy para atender su solicitud. ¿Qué necesita?"
    ],
    directo: [
      "Hola, soy el bot de " + name + ". ¿Qué necesitas?",
      "Hola 👋 Dime qué buscas y te ayudo de una."
    ]
  }[cleanChoice(tone, GREETING_TONES, "cercano")];
}

function farewellProposals(tone, businessName) {
  const name = cleanText(businessName, 120) || "{negocio}";
  return {
    cercano: [
      "¡Gracias por escribirnos! Si necesitas algo más, aquí estoy 🙌",
      "Listo, {nombre}. Que tengas un lindo día — cualquier cosa me escribes."
    ],
    formal: [
      "Gracias por comunicarse con " + name + ". Quedamos atentos a cualquier inquietud.",
      "Ha sido un gusto atenderle. Estamos disponibles cuando lo requiera."
    ],
    directo: [
      "Listo. Cualquier cosa me escribes.",
      "Gracias. Aquí estoy si necesitas algo más."
    ]
  }[cleanChoice(tone, GREETING_TONES, "cercano")];
}

function parseFaqText(value) {
  const text = cleanText(value, 8000);
  if (!text) return [];
  const lines = text.split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
  const result = [];
  for (let index = 0; index < lines.length && result.length < 20; index += 1) {
    const line = lines[index].replace(/^[-*•\d.)\s]+/, "").trim();
    const split = line.match(/^(.+?\?)\s*[:—-]\s*(.+)$/);
    if (split) {
      result.push({ id: "faq-" + (result.length + 1), question: split[1], answer: split[2] });
      continue;
    }
    if (line.includes("?") && lines[index + 1]) {
      result.push({
        id: "faq-" + (result.length + 1),
        question: line,
        answer: lines[index + 1].replace(/^[-*•\s]+/, "").trim()
      });
      index += 1;
    }
  }
  if (!result.length) {
    result.push({
      id: "faq-1",
      question: "Información frecuente de clientes",
      answer: text
    });
  }
  return result;
}

function defaultShippingFields() {
  return [
    ["full_name", "Nombre completo", true],
    ["document", "Cédula", true],
    ["phone", "Celular", true],
    ["address", "Dirección", true],
    ["city", "Ciudad", true],
    ["special_instructions", "Indicaciones especiales", false]
  ].map(function (row) {
    return { id: row[0], label: row[1], required: row[2] };
  });
}

function defaultsFromOnboarding(record, planId) {
  const answers = record && record.answers || {};
  const service = answers.customer_service_setup || {};
  const operations = answers.operations || {};
  const business = answers.business || {};
  const team = answers.team || {};
  const appointment = answers.appointment_setup || {};
  const businessName = cleanText(
    service.business_name || business.brand_name || business.legal_name,
    120
  );
  const botName = cleanText(service.bot_display_name, 120) || "Nextfor";
  const tone = setupTone(service.tone);
  const greeting = cleanText(operations.greeting || service.greeting, 600) ||
    greetingProposals(tone, businessName)[0];
  const farewell = farewellProposals(tone, businessName)[0];
  const hours = cleanText(operations.support_hours || operations.business_hours, 1600);
  const address = [operations.primary_city, operations.primary_country]
    .map(function (value) { return cleanText(value, 120); })
    .filter(Boolean)
    .join(", ");
  return {
    version: 2,
    response_length: "muy_breve",
    emoji_level: "pocos",
    profile: {
      avatar_url: cleanAvatarImage(service.company_logo),
      display_name: botName,
      description: cleanText(service.value_proposition || service.business_offer_description, 256)
    },
    greeting: {
      tone,
      selected: 0,
      custom: false,
      text: greeting
    },
    business: {
      hours,
      address,
      returns_policy: cleanText(
        [operations.warranties, operations.important_policies].filter(Boolean).join("\n"),
        5000
      ),
      out_of_hours_notice: true
    },
    shipping: {
      fields: defaultShippingFields(),
      pricing_mode: "quote",
      flat_fee_cop: 0,
      free_over_cop: 0,
      policy: cleanText(operations.shipping, 3000)
    },
    reminders: {
      type: cleanText(appointment.reminder_channel, 80) ? "reservation" : "reservation",
      selected: 0,
      custom: false,
      text: "¡Hola {nombre}! Te recordamos tu reserva en {negocio} para el {fecha} a las {hora}. Estamos en {direccion}. ¿Nos confirmas que vienes?",
      timings: ["one_day", "three_hours"],
      allow_confirm_cancel: true
    },
    catalog: {
      price_mode: "exact",
      out_of_stock_message: "En este momento ese producto está agotado. Puedo mostrarte alternativas similares disponibles."
    },
    payments: {
      methods: cleanText(operations.payments, 100)
        ? ["nequi_daviplata", "transfer", "cash_on_delivery"]
        : [],
      confirmation_message: "¡Listo! Recibimos los datos de tu pedido. Una persona del equipo confirmará el pago y la entrega."
    },
    faqs: parseFaqText(operations.frequent_questions),
    escalation: {
      triggers: [
        "customer_requests",
        "customer_upset",
        "three_failed_attempts",
        "claim_or_warranty",
        "unknown_answer"
      ],
      notify_contact: cleanText(team.human_support_contact, 600)
    },
    farewell: {
      tone,
      selected: 0,
      custom: false,
      text: farewell
    },
    preferred_words: "",
    avoided_words: cleanText(service.brand_restrictions, 1600),
    custom_instructions: cleanText(operations.bot_instructions, 5000),
    extra_context: "",
    plan_id: planSlug(planId),
    updated_at: null,
    updated_by: ""
  };
}

function normalizeShippingFields(value, fallback) {
  const source = Array.isArray(value) ? value : fallback;
  const allowedSuggestionIds = SHIPPING_SUGGESTIONS.map(function (row) { return row[0]; });
  const allowedIds = new Set(defaultShippingFields().map(function (row) { return row.id; }).concat(allowedSuggestionIds));
  const rows = [];
  (source || []).slice(0, 16).forEach(function (item, index) {
    const id = cleanText(item && item.id, 80).toLowerCase().replace(/[^a-z0-9_-]/g, "");
    const label = cleanText(item && item.label, 120);
    if (!id || !label || !allowedIds.has(id) || rows.some(function (row) { return row.id === id; })) return;
    rows.push({ id, label, required: cleanBoolean(item.required, index < 5) });
  });
  return rows.length ? rows : defaultShippingFields();
}

function normalizeFaqs(value, fallback) {
  const source = Array.isArray(value) ? value : fallback;
  return (source || []).slice(0, 30).map(function (item, index) {
    return {
      id: cleanText(item && item.id, 80).replace(/[^a-zA-Z0-9_-]/g, "") || "faq-" + (index + 1),
      question: cleanText(item && (item.question || item.q), 500),
      answer: cleanText(item && (item.answer || item.a), 3000)
    };
  }).filter(function (item) {
    return item.question || item.answer;
  });
}

function normalizeBotConfiguration(input, meta) {
  input = input && typeof input === "object" ? input : {};
  meta = meta || {};
  const fallback = meta.fallback && typeof meta.fallback === "object" ? meta.fallback : {};
  const planId = planSlug(meta.plan_id || input.plan_id || fallback.plan_id);
  const profile = input.profile || {};
  const profileFallback = fallback.profile || {};
  const greeting = input.greeting || {};
  const greetingFallback = fallback.greeting || {};
  const business = input.business || {};
  const businessFallback = fallback.business || {};
  const shipping = input.shipping || {};
  const shippingFallback = fallback.shipping || {};
  const reminders = input.reminders || {};
  const remindersFallback = fallback.reminders || {};
  const catalog = input.catalog || {};
  const catalogFallback = fallback.catalog || {};
  const payments = input.payments || {};
  const paymentsFallback = fallback.payments || {};
  const escalation = input.escalation || {};
  const escalationFallback = fallback.escalation || {};
  const farewell = input.farewell || {};
  const farewellFallback = fallback.farewell || {};
  return {
    version: 2,
    response_length: cleanChoice(
      input.response_length,
      RESPONSE_LENGTHS,
      cleanChoice(fallback.response_length, RESPONSE_LENGTHS, "muy_breve")
    ),
    emoji_level: cleanChoice(
      input.emoji_level,
      EMOJI_LEVELS,
      cleanChoice(fallback.emoji_level, EMOJI_LEVELS, "pocos")
    ),
    profile: {
      avatar_url: cleanAvatarImage(profile.avatar_url != null ? profile.avatar_url : profileFallback.avatar_url),
      display_name: cleanText(profile.display_name != null ? profile.display_name : profileFallback.display_name, 120),
      description: cleanText(profile.description != null ? profile.description : profileFallback.description, 256)
    },
    greeting: {
      tone: cleanChoice(greeting.tone, GREETING_TONES, cleanChoice(greetingFallback.tone, GREETING_TONES, "cercano")),
      selected: Math.max(0, Math.min(1, Number.isFinite(Number(greeting.selected)) ? Number(greeting.selected) : Number(greetingFallback.selected) || 0)),
      custom: cleanBoolean(greeting.custom, greetingFallback.custom),
      text: cleanText(greeting.text != null ? greeting.text : greetingFallback.text, 600)
    },
    business: {
      hours: cleanText(business.hours != null ? business.hours : businessFallback.hours, 1600),
      address: cleanText(business.address != null ? business.address : businessFallback.address, 1600),
      returns_policy: cleanText(
        business.returns_policy != null ? business.returns_policy : businessFallback.returns_policy,
        5000
      ),
      out_of_hours_notice: cleanBoolean(business.out_of_hours_notice, businessFallback.out_of_hours_notice)
    },
    shipping: Object.assign({
      fields: normalizeShippingFields(shipping.fields, shippingFallback.fields)
    }, normalizeShippingPricing(shipping, shippingFallback)),
    reminders: {
      type: cleanChoice(reminders.type, REMINDER_TYPES, cleanChoice(remindersFallback.type, REMINDER_TYPES, "reservation")),
      selected: Math.max(0, Math.min(1, Number.isFinite(Number(reminders.selected)) ? Number(reminders.selected) : Number(remindersFallback.selected) || 0)),
      custom: cleanBoolean(reminders.custom, remindersFallback.custom),
      text: cleanText(reminders.text != null ? reminders.text : remindersFallback.text, 1000),
      timings: uniqueChoices(reminders.timings, ["one_day", "three_hours", "one_hour"], remindersFallback.timings || ["one_day", "three_hours"]),
      allow_confirm_cancel: cleanBoolean(reminders.allow_confirm_cancel, remindersFallback.allow_confirm_cancel)
    },
    catalog: {
      price_mode: cleanChoice(catalog.price_mode, PRICE_MODES, cleanChoice(catalogFallback.price_mode, PRICE_MODES, "exact")),
      out_of_stock_message: cleanText(
        catalog.out_of_stock_message != null ? catalog.out_of_stock_message : catalogFallback.out_of_stock_message,
        1200
      )
    },
    payments: {
      methods: uniqueChoices(payments.methods, PAYMENT_METHODS, paymentsFallback.methods || []),
      confirmation_message: cleanText(
        payments.confirmation_message != null ? payments.confirmation_message : paymentsFallback.confirmation_message,
        1200
      )
    },
    faqs: normalizeFaqs(input.faqs, fallback.faqs),
    escalation: {
      triggers: uniqueChoices(escalation.triggers, ESCALATION_TRIGGERS, escalationFallback.triggers || []),
      notify_contact: cleanText(
        escalation.notify_contact != null ? escalation.notify_contact : escalationFallback.notify_contact,
        600
      )
    },
    farewell: {
      tone: cleanChoice(farewell.tone, GREETING_TONES, cleanChoice(farewellFallback.tone, GREETING_TONES, "cercano")),
      selected: Math.max(0, Math.min(1, Number.isFinite(Number(farewell.selected)) ? Number(farewell.selected) : Number(farewellFallback.selected) || 0)),
      custom: cleanBoolean(farewell.custom, farewellFallback.custom),
      text: cleanText(farewell.text != null ? farewell.text : farewellFallback.text, 600)
    },
    preferred_words: cleanText(
      input.preferred_words != null ? input.preferred_words : fallback.preferred_words,
      1600
    ),
    avoided_words: cleanText(
      input.avoided_words != null ? input.avoided_words : fallback.avoided_words,
      1600
    ),
    custom_instructions: cleanText(
      input.custom_instructions != null ? input.custom_instructions : fallback.custom_instructions,
      5000
    ),
    extra_context: cleanText(
      input.extra_context != null ? input.extra_context : fallback.extra_context,
      5000
    ),
    plan_id: planId,
    updated_at: cleanText(meta.updated_at, 40) || new Date().toISOString(),
    updated_by: cleanText(meta.updated_by, 160)
  };
}

function configurationForOnboarding(record, planId) {
  const resolvedPlan = planSlug(planId || record && record.bot_personality && record.bot_personality.plan_id);
  const fallback = defaultsFromOnboarding(record, resolvedPlan);
  return normalizeBotConfiguration(record && record.bot_personality, {
    fallback,
    plan_id: resolvedPlan,
    updated_at: record && record.bot_personality && record.bot_personality.updated_at || null,
    updated_by: record && record.bot_personality && record.bot_personality.updated_by || ""
  });
}

function promptList(title, values) {
  const clean = (values || []).map(function (value) { return cleanText(value, 3000); }).filter(Boolean);
  return clean.length ? title + "\n" + clean.map(function (value) { return "- " + value; }).join("\n") : "";
}

function buildBotConfigurationPrompt(configuration, meta) {
  meta = meta || {};
  const config = normalizeBotConfiguration(configuration, { plan_id: meta.plan_id || configuration && configuration.plan_id });
  const features = planFeatures(meta.plan_id || config.plan_id);
  const lengthRule = {
    muy_breve: "Responde por defecto en 1 o 2 frases cortas. No presentes menús de capacidades ni introducciones largas. Haz como máximo una pregunta por mensaje.",
    breve: "Responde por defecto en 2 a 4 frases cortas. Usa listas solo cuando realmente aclaren la respuesta. Haz como máximo una pregunta por mensaje.",
    detallada: "Puedes responder con más detalle cuando ayude a resolver la solicitud. Evita repeticiones y haz como máximo dos preguntas por mensaje."
  }[config.response_length];
  const emojiRule = {
    ninguno: "No uses emojis.",
    pocos: "Usa como máximo 1 emoji cuando aporte calidez; no es obligatorio.",
    moderados: "Puedes usar hasta 2 emojis pertinentes por mensaje."
  }[config.emoji_level];
  const lines = [
    "CONFIGURACIÓN ACTUAL PUBLICADA POR EL CLIENTE (aplica inmediatamente, incluso a conversaciones abiertas):",
    "Esta configuración reemplaza cualquier dato diferente o anterior del setup inicial.",
    "- Extensión: " + lengthRule,
    "- Emojis: " + emojiRule,
    "- Nombre del asistente: " + (config.profile.display_name || "Nextfor") + ".",
    "- No repitas el saludo en una conversación ya iniciada.",
    "- Responde primero a la intención concreta del cliente.",
    "- No inventes horarios, precios, políticas, disponibilidad, pagos ni datos de despacho."
  ];
  if (config.profile.description) lines.push("- Descripción del negocio y del asistente: " + config.profile.description);
  if (config.greeting.text) lines.push("- Saludo exacto para el primer mensaje: " + config.greeting.text);
  if (config.business.hours) lines.push("- Horario del negocio: " + config.business.hours);
  if (config.business.address) lines.push("- Dirección o ubicación: " + config.business.address);
  if (config.business.returns_policy) lines.push("- Política de cambios y devoluciones: " + config.business.returns_policy);
  if (config.business.out_of_hours_notice) lines.push("- Fuera del horario humano, sigue respondiendo y aclara cuándo atenderá una persona.");
  if (features.shipping && config.shipping.fields.length) {
    lines.push("DATOS DE ENVÍO: cuando el cliente solicite un despacho, pide uno por uno y en este orden: " +
      config.shipping.fields.map(function (field) {
        return field.label + (field.required ? " (obligatorio)" : " (opcional)");
      }).join(", ") + ".");
  }
  if (features.shipping) {
    if (config.shipping.pricing_mode === "flat" && config.shipping.flat_fee_cop > 0) {
      lines.push("- Costo de envío: $" + config.shipping.flat_fee_cop.toLocaleString("es-CO") + " COP" +
        (config.shipping.free_over_cop > 0
          ? "; es gratis desde $" + config.shipping.free_over_cop.toLocaleString("es-CO") + " COP de subtotal"
          : "") + ". El sistema calcula y suma este valor; no hagas la suma por tu cuenta.");
    } else if (config.shipping.pricing_mode === "free") {
      lines.push("- Costo de envío: gratis. El sistema lo registra como $0 COP.");
    } else {
      lines.push("- Costo de envío: por confirmar. Nunca digas que es gratis ni envíes instrucciones de pago con un total incompleto; escala para cotizarlo.");
    }
    if (config.shipping.policy) lines.push("- Reglas y cobertura de envío: " + config.shipping.policy);
  }
  if (features.catalog) {
    lines.push("- Política de precios: " + ({
      exact: "da el precio exacto del catálogo, sin inventar descuentos",
      range: "da un rango y confirma los datos antes de cotizar",
      human: "no da precios; explica el producto y escala la cotización"
    })[config.catalog.price_mode] + ".");
    if (config.catalog.out_of_stock_message) lines.push("- Si algo está agotado: " + config.catalog.out_of_stock_message);
  }
  if (features.payments) {
    const paymentLabels = {
      nequi_daviplata: "Nequi o Daviplata",
      transfer: "transferencia",
      cash_on_delivery: "contraentrega",
      payment_link: "link de pago",
      card: "tarjeta"
    };
    lines.push("- Métodos de pago autorizados: " + (
      config.payments.methods.length
        ? config.payments.methods.map(function (method) { return paymentLabels[method]; }).join(", ")
        : "ninguno; escala a una persona"
    ) + ".");
    if (config.payments.confirmation_message) lines.push("- Al confirmar el pedido: " + config.payments.confirmation_message);
  }
  if (features.reminders && config.reminders.text) {
    const reminderTypeLabels = {
      reservation: "reserva en sitio",
      virtual: "cita virtual",
      home: "servicio a domicilio"
    };
    const reminderTimingLabels = {
      one_day: "un día antes",
      three_hours: "3 horas antes",
      one_hour: "1 hora antes"
    };
    lines.push("- Tipo de recordatorio: " + reminderTypeLabels[config.reminders.type] + ".");
    lines.push("- Plantilla de recordatorio de cita o reserva: " + config.reminders.text);
    lines.push("- Momentos configurados para el recordatorio: " + (
      config.reminders.timings.length
        ? config.reminders.timings.map(function (timing) { return reminderTimingLabels[timing]; }).join(", ")
        : "ninguno"
    ) + ".");
    lines.push(config.reminders.allow_confirm_cancel
      ? "- Permite que el cliente confirme o cancele desde el recordatorio y escala la actualización de la agenda de forma segura."
      : "- No ofrezcas confirmación o cancelación automática desde el recordatorio.");
  }
  if (config.faqs.length) {
    lines.push(promptList("RESPUESTAS EXACTAS PARA PREGUNTAS FRECUENTES:", config.faqs.map(function (faq) {
      return "Pregunta: " + faq.question + "\n  Respuesta: " + faq.answer;
    })));
  }
  if (config.escalation.triggers.length) {
    const labels = {
      customer_requests: "el cliente pide hablar con una persona",
      customer_upset: "el cliente está molesto",
      three_failed_attempts: "hay 3 intentos sin resolver",
      claim_or_warranty: "hay reclamo o garantía",
      special_discount: "piden un descuento especial",
      unknown_answer: "no conoces la respuesta"
    };
    lines.push("- Escala a una persona cuando: " + config.escalation.triggers.map(function (item) {
      return labels[item];
    }).join("; ") + ".");
  }
  if (config.escalation.notify_contact) lines.push("- Contacto humano interno: " + config.escalation.notify_contact);
  if (config.farewell.text) lines.push("- Despedida preferida al cerrar realmente una conversación: " + config.farewell.text);
  if (config.preferred_words) lines.push("- Palabras o expresiones preferidas: " + config.preferred_words);
  if (config.avoided_words) lines.push("- Palabras o expresiones que debes evitar: " + config.avoided_words);
  if (config.custom_instructions) lines.push("- Instrucciones adicionales de comunicación: " + config.custom_instructions);
  if (config.extra_context) lines.push("- Contexto adicional de menor prioridad: " + config.extra_context);
  return lines.filter(Boolean).join("\n");
}

function maxTokensForConfiguration(configuration) {
  return {
    muy_breve: 160,
    breve: 280,
    detallada: 520
  }[normalizeBotConfiguration(configuration).response_length];
}

module.exports = {
  BOT_CONFIGURATION_CONTRACT,
  EMOJI_LEVELS,
  ESCALATION_TRIGGERS,
  GREETING_TONES,
  PAYMENT_METHODS,
  RESPONSE_LENGTHS,
  SHIPPING_SUGGESTIONS,
  buildBotConfigurationPrompt,
  buildBotPersonalityPrompt: buildBotConfigurationPrompt,
  configurationForOnboarding,
  defaultsFromOnboarding,
  farewellProposals,
  greetingProposals,
  maxTokensForConfiguration,
  maxTokensForPersonality: maxTokensForConfiguration,
  normalizeBotConfiguration,
  normalizeBotPersonality: normalizeBotConfiguration,
  parseFaqText,
  personalityForOnboarding: configurationForOnboarding,
  planFeatures,
  planSlug
};
