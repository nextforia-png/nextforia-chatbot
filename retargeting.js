const crypto = require("crypto");

const TIMEZONE = "America/Bogota";
const HARD_WINDOW_START = "09:00";
const HARD_WINDOW_END = "19:00";
const HARD_MAX_MARKETING_7D = 2;
const REAL_SENDS_ENABLED = false;
const AUTOMATIC_MODE_ENABLED = false;

const EVENT_TEMPLATES = {
  high_intent: null,
  abandoned_cart: "abandoned_cart_rav",
  post_purchase: "post_sale_review_rav",
  back_in_stock: "back_in_stock_rav",
  recommendation: "product_recommendation_rav"
};

const OPEN_STATUSES = new Set(["simulation_pending", "pending_approval", "approved"]);
const CANCELLING_SIGNALS = new Set(["customer_replied", "purchase_confirmed", "handoff", "stop", "consent_revoked"]);
const CONSENT_CATEGORIES = new Set(["marketing", "cart", "post_purchase", "back_in_stock", "recommendations"]);

function cleanText(value, max) {
  return String(value == null ? "" : value).replace(/\u0000/g, "").trim().slice(0, max || 1000);
}

function cleanId(value, max) {
  return cleanText(value, max || 160).toLowerCase().replace(/[^a-z0-9:_-]/g, "");
}

function iso(value, fallback) {
  const parsed = new Date(value || fallback || Date.now());
  return Number.isNaN(parsed.getTime()) ? new Date(fallback || Date.now()).toISOString() : parsed.toISOString();
}

function eventId(prefix, parts) {
  const digest = crypto.createHash("sha256").update(parts.map(String).join("|")).digest("hex").slice(0, 28);
  return cleanId(prefix || "evt", 24) + "_" + digest;
}

function jobIdempotencyKey(input) {
  return eventId("rtg", [
    cleanId(input.tenant_id),
    cleanId(input.customer_id),
    cleanId(input.channel),
    cleanId(input.event_type),
    cleanText(input.source_event_id, 240)
  ]);
}

function isStopMessage(value) {
  const text = cleanText(value, 300).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /(^|\b)(stop|salir|no mas|no quiero mas|cancelar|darse de baja|baja|dejen de escribir|no me escriban)(\b|$)/i.test(text);
}

function minutes(value, fallback) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || fallback));
  if (!match) return minutes(fallback || HARD_WINDOW_START, HARD_WINDOW_START);
  return Number(match[1]) * 60 + Number(match[2]);
}

function timeText(totalMinutes) {
  const bounded = Math.max(0, Math.min(1439, totalMinutes));
  return String(Math.floor(bounded / 60)).padStart(2, "0") + ":" + String(bounded % 60).padStart(2, "0");
}

function normalizePolicy(value) {
  value = value && typeof value === "object" ? value : {};
  const start = Math.max(minutes(HARD_WINDOW_START), minutes(value.send_window_start, HARD_WINDOW_START));
  const end = Math.min(minutes(HARD_WINDOW_END), minutes(value.send_window_end, HARD_WINDOW_END));
  const safeEnd = end > start ? end : minutes(HARD_WINDOW_END);
  const mode = ["disabled", "simulation", "manual", "automatic"].includes(value.mode) ? value.mode : "disabled";
  return {
    mode,
    high_intent_delay_hours: Math.max(1, Math.min(23, Number(value.high_intent_delay_hours) || 3)),
    abandoned_cart_delay_hours: Math.max(24, Math.min(168, Number(value.abandoned_cart_delay_hours) || 24)),
    post_purchase_delay_days: Math.max(1, Math.min(30, Number(value.post_purchase_delay_days) || 3)),
    max_marketing_messages_7d: Math.min(HARD_MAX_MARKETING_7D, Math.max(1, Number(value.max_marketing_messages_7d) || 2)),
    send_window_start: timeText(start),
    send_window_end: timeText(safeEnd),
    timezone: TIMEZONE,
    require_marketing_opt_in: true,
    stop_on_reply: true,
    stop_on_purchase: true,
    stop_on_handoff: true,
    stop_on_opt_out: true
  };
}

// America/Bogota has a fixed UTC-5 offset. Keeping the conversion explicit makes
// scheduling deterministic without adding a runtime dependency.
function bogotaParts(dateValue) {
  const local = new Date(new Date(dateValue).getTime() - 5 * 60 * 60 * 1000);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth(),
    day: local.getUTCDate(),
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes()
  };
}

function bogotaToUtc(parts) {
  return new Date(Date.UTC(parts.year, parts.month, parts.day, parts.hour + 5, parts.minute || 0, 0, 0));
}

function addBogotaDays(parts, days) {
  const local = new Date(Date.UTC(parts.year, parts.month, parts.day + days, parts.hour, parts.minute || 0));
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth(),
    day: local.getUTCDate(),
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes()
  };
}

function adjustToSendWindow(dateValue, policyValue) {
  const policy = normalizePolicy(policyValue);
  const parts = bogotaParts(dateValue);
  const current = parts.hour * 60 + parts.minute;
  const start = minutes(policy.send_window_start, HARD_WINDOW_START);
  const end = minutes(policy.send_window_end, HARD_WINDOW_END);
  if (current < start) {
    parts.hour = Math.floor(start / 60);
    parts.minute = start % 60;
  } else if (current >= end) {
    const next = addBogotaDays(parts, 1);
    parts.year = next.year;
    parts.month = next.month;
    parts.day = next.day;
    parts.hour = Math.floor(start / 60);
    parts.minute = start % 60;
  }
  return bogotaToUtc(parts).toISOString();
}

function consentCategory(eventType) {
  if (eventType === "abandoned_cart") return "cart";
  if (eventType === "post_purchase") return "post_purchase";
  if (eventType === "back_in_stock") return "back_in_stock";
  if (eventType === "recommendation") return "recommendations";
  return "marketing";
}

function scheduledAt(input, policy) {
  const source = new Date(iso(input.source_at));
  let delayMs = 0;
  if (input.event_type === "high_intent") delayMs = policy.high_intent_delay_hours * 60 * 60 * 1000;
  if (input.event_type === "abandoned_cart") delayMs = policy.abandoned_cart_delay_hours * 60 * 60 * 1000;
  if (input.event_type === "post_purchase") delayMs = policy.post_purchase_delay_days * 24 * 60 * 60 * 1000;
  return adjustToSendWindow(new Date(source.getTime() + delayMs), policy);
}

function templateRequired(input, scheduled) {
  if (EVENT_TEMPLATES[input.event_type]) return true;
  const lastInbound = new Date(iso(input.last_customer_message_at, input.source_at));
  return new Date(scheduled).getTime() - lastInbound.getTime() >= 24 * 60 * 60 * 1000;
}

function templateEligible(input, required) {
  if (!required) return { ok: true, expected: null };
  const expected = EVENT_TEMPLATES[input.event_type] || cleanText(input.template && input.template.name, 120);
  const template = input.template || {};
  if (!expected || cleanText(template.name, 120) !== expected) return { ok: false, reason: "approved_template_missing", expected };
  if (template.status !== "approved" || template.active !== true) return { ok: false, reason: "template_not_approved_or_active", expected };
  if (template.quality && ["paused", "rejected", "disabled"].includes(template.quality)) return { ok: false, reason: "template_quality_blocked", expected };
  return { ok: true, expected };
}

function consentEligible(consent, category, at) {
  if (consent && (consent.revoked_at || consent.granted === false)) return { ok: false, reason: "consent_revoked" };
  if (!consent || consent.granted !== true) return { ok: false, reason: "verified_consent_required" };
  if (!cleanText(consent.proof_id, 240)) return { ok: false, reason: "consent_proof_missing" };
  if (consent.category !== "marketing" && consent.category !== category) return { ok: false, reason: "consent_category_mismatch" };
  if (consent.expires_at && new Date(consent.expires_at).getTime() <= new Date(at).getTime()) return { ok: false, reason: "consent_expired" };
  return { ok: true };
}

function reduceEvents(events, tenantId) {
  const state = {
    tenant_id: tenantId,
    paused: false,
    paused_at: null,
    jobs: {},
    consents: {},
    templates: {},
    customer_signals: {},
    history: []
  };
  (events || []).slice().sort(function (a, b) {
    return new Date(a.created_at || 0) - new Date(b.created_at || 0);
  }).forEach(function (event) {
    if (!event || event.tenant_id !== tenantId) return;
    state.history.push(event);
    if (event.type === "tenant_paused") {
      state.paused = true;
      state.paused_at = event.created_at;
    } else if (event.type === "tenant_resumed") {
      state.paused = false;
      state.paused_at = null;
    } else if (event.type === "consent_recorded" || event.type === "consent_revoked") {
      const consent = event.payload && event.payload.consent;
      if (consent) state.consents[consent.customer_id + ":" + consent.category] = consent;
    } else if (event.type === "customer_signal") {
      const customerId = event.customer_id;
      if (!state.customer_signals[customerId]) state.customer_signals[customerId] = [];
      state.customer_signals[customerId].push(event);
    } else if (event.type === "template_status") {
      const template = event.payload && event.payload.template;
      if (template && template.name) state.templates[template.name] = template;
    } else if (event.type === "job_created") {
      const job = event.payload && event.payload.job;
      if (job && !state.jobs[job.id]) state.jobs[job.id] = Object.assign({}, job);
    } else if (event.type === "job_transition" && state.jobs[event.job_id]) {
      Object.assign(state.jobs[event.job_id], event.payload && event.payload.patch || {}, { updated_at: event.created_at });
    }
  });
  return state;
}

function latestConsent(state, customerId, category) {
  return state.consents[customerId + ":" + category] || state.consents[customerId + ":marketing"] || null;
}

function marketingCount7d(state, customerId, at) {
  const threshold = new Date(at).getTime() - 7 * 24 * 60 * 60 * 1000;
  return Object.values(state.jobs).filter(function (job) {
    return job.customer_id === customerId && job.status === "sent" && new Date(job.sent_at || job.updated_at || 0).getTime() >= threshold;
  }).length;
}

function laterCancellationSignal(state, customerId, sourceAt) {
  const threshold = new Date(sourceAt).getTime();
  return (state.customer_signals[customerId] || []).find(function (event) {
    return CANCELLING_SIGNALS.has(event.payload && event.payload.signal) && new Date(event.created_at).getTime() > threshold;
  }) || null;
}

function activeOptOut(state, customerId) {
  const signal = (state.customer_signals[customerId] || []).filter(function (event) {
    return ["stop", "consent_revoked"].includes(event.payload && event.payload.signal);
  }).sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); })[0];
  if (!signal) return null;
  const latestGrant = Object.values(state.consents).filter(function (consent) {
    return consent.customer_id === customerId && consent.granted === true && !consent.revoked_at;
  }).sort(function (a, b) { return new Date(b.granted_at) - new Date(a.granted_at); })[0];
  return !latestGrant || new Date(signal.created_at).getTime() >= new Date(latestGrant.granted_at).getTime() ? signal : null;
}

function previewFor(job) {
  const name = cleanText(job.context && job.context.preferred_name, 60);
  const product = cleanText(job.context && job.context.product_name, 120);
  const hello = name ? "Hola " + name + ", " : "Hola, ";
  const subject = product ? " sobre " + product : " sobre tu consulta";
  return hello + "retomamos la conversación" + subject + " porque nos autorizaste este seguimiento. Si no deseas recibir más mensajes, responde SALIR.";
}

function publicJob(job) {
  const copy = Object.assign({}, job);
  if (copy.consent) copy.consent = {
    category: copy.consent.category,
    proof_id: copy.consent.proof_id,
    granted_at: copy.consent.granted_at,
    expires_at: copy.consent.expires_at || null
  };
  return copy;
}

class MemoryRetargetingStore {
  constructor(seed) {
    this.events = Array.isArray(seed) ? seed.slice() : [];
  }
  async list(tenantId) {
    return this.events.filter(function (event) { return event.tenant_id === tenantId; });
  }
  async append(event) {
    if (!this.events.some(function (row) { return row.id === event.id; })) this.events.push(event);
    return event;
  }
}

class RetargetingEngine {
  constructor(options) {
    this.store = options && options.store || new MemoryRetargetingStore();
    this.now = options && options.now || function () { return new Date(); };
  }

  async state(tenantId) {
    const cleanTenant = cleanId(tenantId, 120);
    return reduceEvents(await this.store.list(cleanTenant), cleanTenant);
  }

  async append(tenantId, type, details) {
    details = details || {};
    const createdAt = iso(details.created_at, this.now());
    const id = details.id || eventId(type, [tenantId, details.job_id || "", details.customer_id || "", createdAt, details.nonce || ""]);
    return this.store.append({
      version: 1,
      id,
      tenant_id: cleanId(tenantId, 120),
      type,
      created_at: createdAt,
      actor: cleanText(details.actor || "system", 120),
      job_id: cleanId(details.job_id, 160) || null,
      customer_id: cleanId(details.customer_id, 180) || null,
      payload: details.payload || {}
    });
  }

  async recordConsent(input) {
    const tenantId = cleanId(input.tenant_id, 120);
    const customerId = cleanId(input.customer_id, 180);
    const category = CONSENT_CATEGORIES.has(input.category) ? input.category : "marketing";
    if (!tenantId || !customerId) throw new Error("tenant_and_customer_required");
    if (input.granted !== false && !cleanText(input.proof_id, 240)) throw new Error("consent_proof_required");
    const grantedAt = iso(input.granted_at, this.now());
    const consent = {
      tenant_id: tenantId,
      customer_id: customerId,
      category,
      granted: input.granted !== false,
      proof_id: cleanText(input.proof_id, 240),
      proof_type: cleanText(input.proof_type || "documented", 80),
      granted_at: grantedAt,
      expires_at: input.expires_at ? iso(input.expires_at) : null,
      revoked_at: input.granted === false ? iso(input.revoked_at, this.now()) : null
    };
    await this.append(tenantId, input.granted === false ? "consent_revoked" : "consent_recorded", {
      id: eventId("consent", [tenantId, customerId, category, grantedAt, consent.granted]),
      customer_id: customerId,
      actor: input.actor,
      payload: { consent }
    });
    if (input.granted === false) await this.recordCustomerSignal({ tenant_id: tenantId, customer_id: customerId, signal: "consent_revoked", actor: input.actor });
    return consent;
  }

  async createJob(input, policyValue) {
    const policy = normalizePolicy(policyValue);
    const tenantId = cleanId(input.tenant_id, 120);
    const customerId = cleanId(input.customer_id, 180);
    const channel = cleanId(input.channel || "whatsapp", 40);
    if (!tenantId || !customerId || !cleanText(input.source_event_id, 240)) throw new Error("tenant_customer_and_source_event_required");
    if (policy.mode === "disabled") return { created: false, reason: "retargeting_disabled" };
    const state = await this.state(tenantId);
    const idempotencyKey = jobIdempotencyKey(Object.assign({}, input, { tenant_id: tenantId, customer_id: customerId, channel }));
    const existing = Object.values(state.jobs).find(function (job) { return job.idempotency_key === idempotencyKey; });
    if (existing) return { created: false, idempotent: true, job: publicJob(existing) };

    const sourceAt = iso(input.source_at, this.now());
    const schedule = scheduledAt(Object.assign({}, input, { source_at: sourceAt }), policy);
    const category = consentCategory(input.event_type);
    const consent = input.consent || latestConsent(state, customerId, category);
    const requiredTemplate = templateRequired(input, schedule);
    const expectedTemplateName = EVENT_TEMPLATES[input.event_type] || cleanText(input.template && input.template.name, 120);
    const effectiveTemplate = state.templates[expectedTemplateName] || input.template || null;
    const templateInput = Object.assign({}, input, { template: effectiveTemplate });
    const templateCheck = templateEligible(templateInput, requiredTemplate);
    const consentCheck = consentEligible(consent, category, schedule);
    const blockers = [];
    if (state.paused) blockers.push("tenant_paused");
    if (!Object.prototype.hasOwnProperty.call(EVENT_TEMPLATES, input.event_type)) blockers.push("unsupported_source_event");
    if (channel !== "whatsapp") blockers.push("channel_not_supported_for_commercial_scheduler");
    if (cleanId(input.channel_tenant_id || tenantId, 120) !== tenantId) blockers.push("channel_tenant_mismatch");
    if (!consentCheck.ok) blockers.push(consentCheck.reason);
    if (!templateCheck.ok) blockers.push(templateCheck.reason);
    const optOut = activeOptOut(state, customerId);
    if (optOut) blockers.push("customer_event_" + optOut.payload.signal);
    if (marketingCount7d(state, customerId, schedule) >= policy.max_marketing_messages_7d) blockers.push("marketing_frequency_limit_7d");
    const cancellation = laterCancellationSignal(state, customerId, sourceAt);
    if (cancellation) blockers.push("customer_event_" + cancellation.payload.signal);
    if (policy.mode === "automatic" && !AUTOMATIC_MODE_ENABLED) blockers.push("automatic_mode_not_enabled");

    const jobId = idempotencyKey;
    const status = blockers.length ? "blocked" : policy.mode === "simulation" ? "simulation_pending" : "pending_approval";
    const job = {
      id: jobId,
      idempotency_key: idempotencyKey,
      tenant_id: tenantId,
      customer_id: customerId,
      channel,
      event_type: input.event_type,
      source_event_id: cleanText(input.source_event_id, 240),
      source_at: sourceAt,
      last_customer_message_at: iso(input.last_customer_message_at, sourceAt),
      scheduled_for: schedule,
      status,
      mode: policy.mode,
      category,
      consent: consent || null,
      template: requiredTemplate ? {
        name: templateCheck.expected || cleanText(input.template && input.template.name, 120),
        language: cleanText(effectiveTemplate && effectiveTemplate.language || "es", 20),
        status: cleanText(effectiveTemplate && effectiveTemplate.status, 40),
        active: !!(effectiveTemplate && effectiveTemplate.active),
        quality: cleanText(effectiveTemplate && effectiveTemplate.quality, 40)
      } : null,
      template_required: requiredTemplate,
      within_24h: !requiredTemplate,
      policy,
      context: {
        preferred_name: cleanText(input.context && input.context.preferred_name, 60),
        product_name: cleanText(input.context && input.context.product_name, 120),
        amount_cop: Math.max(0, Math.round(Number(input.context && input.context.amount_cop) || 0))
      },
      preview: "",
      blockers,
      reason: blockers[0] || null,
      approval_required: policy.mode === "manual",
      approved_by: null,
      approved_at: null,
      created_at: iso(this.now()),
      updated_at: iso(this.now()),
      real_send_enabled: REAL_SENDS_ENABLED
    };
    job.preview = previewFor(job);
    await this.append(tenantId, "job_created", {
      id: eventId("job", [tenantId, idempotencyKey]),
      job_id: jobId,
      customer_id: customerId,
      actor: input.actor,
      created_at: job.created_at,
      payload: { job }
    });
    return { created: true, job: publicJob(job) };
  }

  async approveJob(tenantId, jobId, actor) {
    const state = await this.state(tenantId);
    const job = state.jobs[jobId];
    if (!job) throw new Error("job_not_found");
    if (job.status !== "pending_approval") throw new Error("job_not_pending_approval");
    const blockers = [];
    if (state.paused) blockers.push("tenant_paused");
    const consentCheck = consentEligible(latestConsent(state, job.customer_id, job.category), job.category, this.now());
    if (!consentCheck.ok) blockers.push(consentCheck.reason);
    const currentTemplate = job.template && (state.templates[job.template.name] || job.template);
    const templateCheck = templateEligible({ event_type: job.event_type, template: currentTemplate }, job.template_required);
    if (!templateCheck.ok) blockers.push(templateCheck.reason);
    const optOut = activeOptOut(state, job.customer_id);
    if (optOut) blockers.push("customer_event_" + optOut.payload.signal);
    if (laterCancellationSignal(state, job.customer_id, job.source_at)) blockers.push("customer_event_after_source");
    if (marketingCount7d(state, job.customer_id, this.now()) >= job.policy.max_marketing_messages_7d) blockers.push("marketing_frequency_limit_7d");
    if (blockers.length) {
      await this.transition(tenantId, job, { status: "blocked", blockers, reason: blockers[0] }, actor, "approval_blocked");
      return Object.assign({}, job, { status: "blocked", blockers, reason: blockers[0] });
    }
    const patch = { status: "approved", approved_by: cleanText(actor, 120), approved_at: iso(this.now()), blockers: [], reason: null };
    await this.transition(tenantId, job, patch, actor, "manual_approval");
    return Object.assign({}, job, patch);
  }

  async transition(tenantId, job, patch, actor, reason) {
    return this.append(tenantId, "job_transition", {
      id: eventId("transition", [tenantId, job.id, patch.status, reason || "", iso(this.now())]),
      job_id: job.id,
      customer_id: job.customer_id,
      actor,
      payload: { patch: Object.assign({}, patch, { transition_reason: reason || null }) }
    });
  }

  async cancelJob(tenantId, jobId, actor, reason) {
    const state = await this.state(tenantId);
    const job = state.jobs[jobId];
    if (!job) throw new Error("job_not_found");
    if (!OPEN_STATUSES.has(job.status)) return job;
    const patch = { status: "cancelled", cancelled_at: iso(this.now()), cancelled_by: cleanText(actor, 120), reason: cleanText(reason || "manual_cancel", 160) };
    await this.transition(tenantId, job, patch, actor, patch.reason);
    return Object.assign({}, job, patch);
  }

  async recordCustomerSignal(input) {
    const tenantId = cleanId(input.tenant_id, 120);
    const customerId = cleanId(input.customer_id, 180);
    const signal = cleanId(input.signal, 80);
    if (!tenantId || !customerId || !CANCELLING_SIGNALS.has(signal)) throw new Error("invalid_customer_signal");
    const createdAt = iso(input.created_at, this.now());
    await this.append(tenantId, "customer_signal", {
      id: eventId("signal", [tenantId, customerId, signal, input.source_event_id || createdAt]),
      customer_id: customerId,
      actor: input.actor,
      created_at: createdAt,
      payload: { signal, source_event_id: cleanText(input.source_event_id, 240) }
    });
    const state = await this.state(tenantId);
    const cancelled = [];
    for (const job of Object.values(state.jobs)) {
      if (job.customer_id !== customerId || !OPEN_STATUSES.has(job.status)) continue;
      const patch = { status: "cancelled", cancelled_at: createdAt, cancelled_by: "system", reason: signal };
      await this.transition(tenantId, job, patch, input.actor || "system", signal);
      cancelled.push(job.id);
    }
    return { signal, cancelled };
  }

  async recordTemplateStatus(input) {
    const tenantId = cleanId(input.tenant_id, 120);
    const name = cleanText(input.name, 120);
    if (!tenantId || !name) throw new Error("tenant_and_template_required");
    const template = {
      name,
      language: cleanText(input.language || "es", 20),
      status: cleanId(input.status || "unknown", 40),
      active: input.active === true,
      quality: cleanId(input.quality || "unknown", 40),
      checked_at: iso(input.checked_at, this.now())
    };
    await this.append(tenantId, "template_status", {
      id: eventId("template", [tenantId, name, template.checked_at, template.status, template.active, template.quality]),
      actor: input.actor,
      created_at: template.checked_at,
      payload: { template }
    });
    const eligible = templateEligible({ template, event_type: input.event_type || "" }, true);
    const cancelled = [];
    if (!eligible.ok) {
      const state = await this.state(tenantId);
      for (const job of Object.values(state.jobs)) {
        if (!OPEN_STATUSES.has(job.status) || !job.template || job.template.name !== name) continue;
        const reason = "template_degraded:" + eligible.reason;
        await this.transition(tenantId, job, {
          status: "cancelled",
          cancelled_at: template.checked_at,
          cancelled_by: "system",
          blockers: [eligible.reason],
          reason
        }, input.actor || "template-monitor", reason);
        cancelled.push(job.id);
      }
    }
    return { template, cancelled };
  }

  async pauseTenant(tenantId, actor, reason) {
    const state = await this.state(tenantId);
    if (state.paused) return { paused: true, idempotent: true };
    await this.append(tenantId, "tenant_paused", { actor, payload: { reason: cleanText(reason || "manual_pause", 300) } });
    return { paused: true };
  }

  async resumeTenant(tenantId, actor) {
    const state = await this.state(tenantId);
    if (!state.paused) return { paused: false, idempotent: true };
    await this.append(tenantId, "tenant_resumed", { actor, payload: {} });
    return { paused: false };
  }

  async runWorker(tenantId) {
    const state = await this.state(tenantId);
    const result = { tenant_id: tenantId, paused: state.paused, inspected: 0, simulated: 0, blocked: 0, awaiting_approval: 0, real_messages_sent: 0 };
    if (state.paused) return result;
    const now = this.now();
    for (const job of Object.values(state.jobs)) {
      if (!OPEN_STATUSES.has(job.status)) continue;
      result.inspected++;
      const signal = laterCancellationSignal(state, job.customer_id, job.source_at);
      const consentCheck = consentEligible(latestConsent(state, job.customer_id, job.category), job.category, now);
      const currentTemplate = job.template && (state.templates[job.template.name] || job.template);
      const templateCheck = templateEligible({ event_type: job.event_type, template: currentTemplate }, job.template_required);
      if (signal || !consentCheck.ok || !templateCheck.ok) {
        const reason = signal ? signal.payload.signal : (!consentCheck.ok ? consentCheck.reason : "template_degraded:" + templateCheck.reason);
        await this.transition(tenantId, job, { status: "cancelled", cancelled_at: iso(now), cancelled_by: "worker", reason }, "worker", reason);
        continue;
      }
      const optOut = activeOptOut(state, job.customer_id);
      if (optOut) {
        const reason = "customer_event_" + optOut.payload.signal;
        await this.transition(tenantId, job, { status: "cancelled", cancelled_at: iso(now), cancelled_by: "worker", reason }, "worker", reason);
        continue;
      }
      if (marketingCount7d(state, job.customer_id, now) >= job.policy.max_marketing_messages_7d) {
        await this.transition(tenantId, job, { status: "blocked", blocked_at: iso(now), blockers: ["marketing_frequency_limit_7d"], reason: "marketing_frequency_limit_7d" }, "worker", "marketing_frequency_limit_7d");
        result.blocked++;
        continue;
      }
      if (new Date(job.scheduled_for).getTime() > now.getTime()) continue;
      if (job.status === "pending_approval") {
        result.awaiting_approval++;
        continue;
      }
      if (job.status === "simulation_pending") {
        await this.transition(tenantId, job, { status: "simulated", simulated_at: iso(now), reason: "simulation_only_no_message_sent" }, "worker", "simulation");
        result.simulated++;
        continue;
      }
      if (job.status === "approved") {
        await this.transition(tenantId, job, { status: "blocked", blocked_at: iso(now), blockers: ["real_sends_disabled"], reason: "real_sends_disabled" }, "worker", "real_sends_disabled");
        result.blocked++;
      }
    }
    return result;
  }

  async snapshot(tenantId) {
    const state = await this.state(tenantId);
    const jobs = Object.values(state.jobs).sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); }).map(publicJob);
    const counts = { pending: 0, approved: 0, simulated: 0, cancelled: 0, blocked: 0, sent: 0 };
    jobs.forEach(function (job) {
      if (job.status === "pending_approval" || job.status === "simulation_pending") counts.pending++;
      else if (Object.prototype.hasOwnProperty.call(counts, job.status)) counts[job.status]++;
    });
    const blockerCounts = {};
    jobs.forEach(function (job) {
      const reasons = new Set(job.blockers || []);
      if (job.reason && job.status === "blocked") reasons.add(job.reason);
      reasons.forEach(function (reason) { blockerCounts[reason] = (blockerCounts[reason] || 0) + 1; });
    });
    return {
      tenant_id: tenantId,
      paused: state.paused,
      paused_at: state.paused_at,
      automatic_mode_enabled: AUTOMATIC_MODE_ENABLED,
      real_sends_enabled: REAL_SENDS_ENABLED,
      timezone: TIMEZONE,
      hard_window: { start: HARD_WINDOW_START, end: HARD_WINDOW_END },
      hard_max_marketing_messages_7d: HARD_MAX_MARKETING_7D,
      counts,
      jobs,
      templates: state.templates,
      blockers: Object.keys(blockerCounts).map(function (reason) { return { reason, count: blockerCounts[reason] }; }).sort(function (a, b) { return b.count - a.count; }),
      history: state.history.slice(-200).reverse()
    };
  }
}

module.exports = {
  TIMEZONE,
  HARD_WINDOW_START,
  HARD_WINDOW_END,
  HARD_MAX_MARKETING_7D,
  REAL_SENDS_ENABLED,
  AUTOMATIC_MODE_ENABLED,
  EVENT_TEMPLATES,
  MemoryRetargetingStore,
  RetargetingEngine,
  normalizePolicy,
  adjustToSendWindow,
  isStopMessage,
  jobIdempotencyKey,
  reduceEvents
};
