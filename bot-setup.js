const INDUSTRY_PROFILES = {
  commerce: {
    label: "Comercio y retail",
    questions: [
      { id: "catalog", label: "¿Dónde debe consultar productos, precios y disponibilidad?", placeholder: "Ej. tienda online, catálogo, asesor comercial…" },
      { id: "delivery", label: "¿Cómo funcionan los envíos, recogidas y tiempos de entrega?", placeholder: "Cobertura, costos, tiempos y excepciones…" },
      { id: "returns", label: "¿Qué debe explicar sobre cambios, garantías y devoluciones?", placeholder: "Condiciones, plazos y pasos…" }
    ]
  },
  restaurants: {
    label: "Restaurantes y alimentos",
    questions: [
      { id: "menu", label: "¿Dónde consulta el menú, precios y disponibilidad?", placeholder: "Menú, platos agotados, promociones…" },
      { id: "orders", label: "¿Cómo se reciben pedidos, reservas y domicilios?", placeholder: "Canales, zonas, horarios y tiempos…" },
      { id: "dietary", label: "¿Cómo debe responder sobre alergias o restricciones alimentarias?", placeholder: "Qué puede confirmar y cuándo debe escalar…" }
    ]
  },
  health: {
    label: "Salud y bienestar",
    questions: [
      { id: "services", label: "¿Qué servicios puede explicar y cuáles requieren valoración profesional?", placeholder: "Servicios, límites y requisitos…" },
      { id: "appointments", label: "¿Cómo se solicitan, confirman o cambian citas?", placeholder: "Horarios, datos mínimos y condiciones…" },
      { id: "safety", label: "¿Qué temas nunca debe diagnosticar y cuándo debe escalar?", placeholder: "Urgencias, síntomas, tratamientos, datos sensibles…" }
    ]
  },
  real_estate: {
    label: "Inmobiliaria y propiedad raíz",
    questions: [
      { id: "inventory", label: "¿Dónde consulta los inmuebles disponibles y sus datos?", placeholder: "Portal, CRM, asesor o inventario…" },
      { id: "qualification", label: "¿Qué debe preguntar para entender lo que busca cada cliente?", placeholder: "Zona, presupuesto, tipo de inmueble, compra o arriendo…" },
      { id: "visits", label: "¿Cómo se coordinan visitas y qué requisitos existen?", placeholder: "Agenda, documentos, horarios y asesor responsable…" }
    ]
  },
  professional_services: {
    label: "Servicios profesionales",
    questions: [
      { id: "scope", label: "¿Qué servicios ofrece y qué casos están fuera de alcance?", placeholder: "Servicios principales y exclusiones…" },
      { id: "qualification", label: "¿Qué información necesita para calificar una solicitud?", placeholder: "Necesidad, plazo, presupuesto, ubicación…" },
      { id: "quotes", label: "¿Cómo funcionan diagnósticos, cotizaciones y tiempos de respuesta?", placeholder: "Proceso, responsables y compromisos…" }
    ]
  },
  education: {
    label: "Educación y formación",
    questions: [
      { id: "programs", label: "¿Qué programas, cursos o niveles puede recomendar?", placeholder: "Oferta, público y modalidad…" },
      { id: "admissions", label: "¿Cómo funcionan inscripción, admisiones y pagos?", placeholder: "Fechas, requisitos y pasos…" },
      { id: "calendar", label: "¿Qué debe saber sobre horarios, calendario y certificaciones?", placeholder: "Jornadas, duración y condiciones…" }
    ]
  },
  hospitality: {
    label: "Hotelería y turismo",
    questions: [
      { id: "availability", label: "¿Dónde consulta disponibilidad, tarifas y planes?", placeholder: "Motor de reservas, asesor o tarifas base…" },
      { id: "policies", label: "¿Qué políticas de reserva, cancelación y llegada debe explicar?", placeholder: "Check-in, check-out, pagos y cancelaciones…" },
      { id: "experience", label: "¿Qué recomendaciones locales o experiencias puede ofrecer?", placeholder: "Actividades, transporte, lugares y límites…" }
    ]
  },
  other: {
    label: "Otra industria",
    questions: [
      { id: "workflow", label: "¿Cuál es el proceso más importante que el bot debe entender?", placeholder: "Explícalo paso a paso…" },
      { id: "questions", label: "¿Qué tres preguntas hacen con mayor frecuencia tus clientes?", placeholder: "Pregunta y respuesta ideal…" },
      { id: "exceptions", label: "¿Qué excepciones o casos especiales debe reconocer?", placeholder: "Casos que cambian la respuesta o requieren una persona…" }
    ]
  }
};

const DEFAULT_ANSWERS = {
  business: {
    name: "RAV Toys",
    bot_name: "RAV-Bot",
    industry: "commerce",
    description: "",
    audience: "",
    differentiators: "",
    website: ""
  },
  presence: {
    locations: "",
    how_to_arrive: "",
    hours: "",
    coverage: ""
  },
  service: {
    main_offering: "",
    frequent_questions: "",
    conditions: "",
    payments: "",
    delivery: ""
  },
  voice: {
    tone: "Cercano, claro y resolutivo",
    formality: "cercano",
    emojis: "moderados",
    preferred_words: "",
    avoided_words: "",
    greeting: ""
  },
  channels: {
    instagram: true,
    messenger: true,
    whatsapp: false,
    web: false,
    notes: ""
  },
  automation: {
    can_answer: "",
    must_not_answer: "",
    handoff_cases: "",
    handoff_contact: "",
    answer_length: "breve"
  },
  retargeting: {
    mode: "disabled",
    high_intent_delay_hours: 3,
    abandoned_cart_delay_hours: 24,
    post_purchase_delay_days: 3,
    max_marketing_messages_7d: 2,
    send_window_start: "09:00",
    send_window_end: "19:00",
    timezone: "America/Bogota",
    require_marketing_opt_in: true,
    stop_on_reply: true,
    stop_on_purchase: true,
    stop_on_handoff: true,
    stop_on_opt_out: true
  },
  outcomes: {
    primary_goal: "",
    success_metrics: "",
    expected_results: "",
    recommendations: ""
  },
  industry_answers: {}
};

function cleanText(value, max) {
  return String(value == null ? "" : value).replace(/\u0000/g, "").trim().slice(0, max || 5000);
}

function cleanChoice(value, allowed, fallback) {
  const clean = cleanText(value, 80).toLowerCase();
  return allowed.includes(clean) ? clean : fallback;
}

function cleanInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function cleanTime(value, fallback) {
  const clean = cleanText(value, 5);
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(clean) ? clean : fallback;
}

function guardedRetargetingTime(value, fallback, minimum, maximum) {
  const clean = cleanTime(value, fallback);
  const toMinutes = function (time) { const parts = time.split(":"); return Number(parts[0]) * 60 + Number(parts[1]); };
  const bounded = Math.max(toMinutes(minimum), Math.min(toMinutes(maximum), toMinutes(clean)));
  return String(Math.floor(bounded / 60)).padStart(2, "0") + ":" + String(bounded % 60).padStart(2, "0");
}

function normalizeAnswers(input) {
  input = input && typeof input === "object" ? input : {};
  const business = input.business || {};
  const presence = input.presence || {};
  const service = input.service || {};
  const voice = input.voice || {};
  const channels = input.channels || {};
  const automation = input.automation || {};
  const retargeting = input.retargeting || {};
  const outcomes = input.outcomes || {};
  const industry = Object.prototype.hasOwnProperty.call(INDUSTRY_PROFILES, business.industry) ? business.industry : "other";
  const industryAnswers = {};
  INDUSTRY_PROFILES[industry].questions.forEach(function (question) {
    industryAnswers[question.id] = cleanText((input.industry_answers || {})[question.id], 3000);
  });
  return {
    business: {
      name: cleanText(business.name, 120),
      bot_name: cleanText(business.bot_name, 80),
      industry,
      description: cleanText(business.description, 3000),
      audience: cleanText(business.audience, 2000),
      differentiators: cleanText(business.differentiators, 2000),
      website: cleanText(business.website, 500)
    },
    presence: {
      locations: cleanText(presence.locations, 4000),
      how_to_arrive: cleanText(presence.how_to_arrive, 3000),
      hours: cleanText(presence.hours, 2000),
      coverage: cleanText(presence.coverage, 2000)
    },
    service: {
      main_offering: cleanText(service.main_offering, 4000),
      frequent_questions: cleanText(service.frequent_questions, 5000),
      conditions: cleanText(service.conditions, 5000),
      payments: cleanText(service.payments, 3000),
      delivery: cleanText(service.delivery, 3000)
    },
    voice: {
      tone: cleanText(voice.tone, 1000),
      formality: cleanChoice(voice.formality, ["cercano", "neutral", "formal"], "cercano"),
      emojis: cleanChoice(voice.emojis, ["ninguno", "pocos", "moderados", "frecuentes"], "moderados"),
      preferred_words: cleanText(voice.preferred_words, 2000),
      avoided_words: cleanText(voice.avoided_words, 2000),
      greeting: cleanText(voice.greeting, 1000)
    },
    channels: {
      instagram: !!channels.instagram,
      messenger: !!channels.messenger,
      whatsapp: !!channels.whatsapp,
      web: !!channels.web,
      notes: cleanText(channels.notes, 2000)
    },
    automation: {
      can_answer: cleanText(automation.can_answer, 4000),
      must_not_answer: cleanText(automation.must_not_answer, 4000),
      handoff_cases: cleanText(automation.handoff_cases, 4000),
      handoff_contact: cleanText(automation.handoff_contact, 1000),
      answer_length: cleanChoice(automation.answer_length, ["muy_breve", "breve", "detallada"], "breve")
    },
    retargeting: {
      mode: cleanChoice(retargeting.mode, ["disabled", "simulation", "manual", "automatic"], "disabled"),
      high_intent_delay_hours: cleanInteger(retargeting.high_intent_delay_hours, 3, 1, 23),
      abandoned_cart_delay_hours: cleanInteger(retargeting.abandoned_cart_delay_hours, 24, 24, 168),
      post_purchase_delay_days: cleanInteger(retargeting.post_purchase_delay_days, 3, 1, 30),
      max_marketing_messages_7d: cleanInteger(retargeting.max_marketing_messages_7d, 2, 1, 2),
      send_window_start: guardedRetargetingTime(retargeting.send_window_start, "09:00", "09:00", "18:59"),
      send_window_end: guardedRetargetingTime(retargeting.send_window_end, "19:00", "09:01", "19:00"),
      timezone: "America/Bogota",
      require_marketing_opt_in: true,
      stop_on_reply: true,
      stop_on_purchase: true,
      stop_on_handoff: true,
      stop_on_opt_out: true
    },
    outcomes: {
      primary_goal: cleanText(outcomes.primary_goal, 2000),
      success_metrics: cleanText(outcomes.success_metrics, 3000),
      expected_results: cleanText(outcomes.expected_results, 3000),
      recommendations: cleanText(outcomes.recommendations, 3000)
    },
    industry_answers: industryAnswers
  };
}

function copyDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_ANSWERS));
}

function hasText(value) {
  return cleanText(value, 20).length > 0;
}

function calculateCompletion(answers) {
  const checks = [
    answers.business.name,
    answers.business.description,
    answers.business.audience,
    answers.presence.locations,
    answers.presence.hours,
    answers.service.main_offering,
    answers.service.conditions,
    answers.voice.tone,
    answers.automation.can_answer,
    answers.automation.handoff_cases,
    answers.outcomes.primary_goal,
    answers.outcomes.success_metrics,
    Object.values(answers.channels).some(function (value) { return value === true; }) ? "yes" : ""
  ];
  return Math.round(checks.filter(hasText).length / checks.length * 100);
}

function addSection(lines, title, rows) {
  const present = rows.filter(function (row) { return hasText(row[1]); });
  if (!present.length) return;
  lines.push("", title + ":");
  present.forEach(function (row) { lines.push("- " + row[0] + ": " + cleanText(row[1], 5000)); });
}

function buildDerivedConfig(answers) {
  answers = normalizeAnswers(answers);
  const profile = INDUSTRY_PROFILES[answers.business.industry];
  const enabledChannels = ["instagram", "messenger", "whatsapp", "web"].filter(function (channel) {
    return answers.channels[channel];
  });
  const lines = [
    "CONFIGURACIÓN PUBLICADA POR EL NEGOCIO (fuente de verdad para identidad, tono y políticas).",
    "Si esta configuración contradice ejemplos o datos comerciales anteriores del prompt, usa esta configuración publicada.",
    "No inventes información ausente: pregunta, explica el límite o deriva a una persona.",
    "",
    "IDENTIDAD:",
    "- Negocio: " + (answers.business.name || "No definido"),
    "- Nombre del asistente: " + (answers.business.bot_name || "Asistente virtual"),
    "- Industria: " + profile.label
  ];
  addSection(lines, "NEGOCIO Y CLIENTES", [
    ["Descripción", answers.business.description],
    ["Cliente ideal", answers.business.audience],
    ["Diferenciadores", answers.business.differentiators],
    ["Sitio web", answers.business.website]
  ]);
  addSection(lines, "SEDES Y COBERTURA", [
    ["Sedes o puntos", answers.presence.locations],
    ["Cómo llegar", answers.presence.how_to_arrive],
    ["Horarios", answers.presence.hours],
    ["Cobertura", answers.presence.coverage]
  ]);
  addSection(lines, "SERVICIO AL CLIENTE", [
    ["Oferta principal", answers.service.main_offering],
    ["Preguntas frecuentes", answers.service.frequent_questions],
    ["Condiciones y políticas", answers.service.conditions],
    ["Pagos", answers.service.payments],
    ["Entregas o prestación", answers.service.delivery]
  ]);
  addSection(lines, "PERSONALIDAD Y ESTILO", [
    ["Tono", answers.voice.tone],
    ["Formalidad", answers.voice.formality],
    ["Uso de emojis", answers.voice.emojis],
    ["Palabras preferidas", answers.voice.preferred_words],
    ["Palabras que debe evitar", answers.voice.avoided_words],
    ["Saludo sugerido", answers.voice.greeting],
    ["Extensión de respuesta", answers.automation.answer_length]
  ]);
  addSection(lines, "AUTONOMÍA Y ESCALAMIENTO", [
    ["Puede responder y gestionar", answers.automation.can_answer],
    ["No debe responder o prometer", answers.automation.must_not_answer],
    ["Debe pasar a una persona cuando", answers.automation.handoff_cases],
    ["Contacto o equipo de escalamiento", answers.automation.handoff_contact]
  ]);
  addSection(lines, "CANALES", [
    ["Canales activos", enabledChannels.join(", ")],
    ["Consideraciones por canal", answers.channels.notes]
  ]);
  addSection(lines, "OBJETIVOS", [
    ["Objetivo principal", answers.outcomes.primary_goal],
    ["Indicadores de éxito", answers.outcomes.success_metrics],
    ["Resultados esperados", answers.outcomes.expected_results]
  ]);
  const industryRows = profile.questions.map(function (question) {
    return [question.label, answers.industry_answers[question.id]];
  });
  addSection(lines, "CONOCIMIENTO ESPECÍFICO DE LA INDUSTRIA", industryRows);
  return {
    business_name: answers.business.name,
    bot_name: answers.business.bot_name,
    industry: answers.business.industry,
    industry_label: profile.label,
    enabled_channels: enabledChannels,
    retargeting: answers.retargeting,
    completion: calculateCompletion(answers),
    system_prompt: lines.join("\n")
  };
}

function createSetupRecord(input, meta) {
  const answers = normalizeAnswers(input && input.answers ? input.answers : input);
  const now = new Date().toISOString();
  const status = meta && meta.status === "published" ? "published" : "draft";
  return {
    version: 1,
    tenant_id: cleanText(meta && meta.tenant_id, 120),
    status,
    answers,
    derived: buildDerivedConfig(answers),
    completion: calculateCompletion(answers),
    updated_at: now,
    updated_by: cleanText(meta && meta.updated_by, 120),
    published_at: status === "published" ? now : null
  };
}

module.exports = {
  INDUSTRY_PROFILES,
  DEFAULT_ANSWERS,
  copyDefaults,
  normalizeAnswers,
  calculateCompletion,
  buildDerivedConfig,
  createSetupRecord
};
