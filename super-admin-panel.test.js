"use strict";

const assert = require("assert");
const renderSuperAdminPanel = require("./super-admin-panel");

let contentType = "";
let html = "";
renderSuperAdminPanel({
  setHeader: function (name, value) {
    if (String(name).toLowerCase() === "content-type") contentType = value;
  },
  send: function (body) { html = body; }
}, {
  auth: { username: "root", name: '<script>alert("x")</script>', role: "super_admin" },
  botVersion: "v-test",
  tenant: { id: "rav-toys", name: "RAV Toys", status: "active", customer_number: 1 },
  registeredClients: [{
    tenant_id: "grupo-derco",
    brand_name: "Grupo Jurídico DERCO S.A.S.",
    short_name: "DERCO",
    customer_number: 1,
    status: "pilot",
    industry: "professional_services"
  }],
  customerSetup: {
    version: 2,
    tenant_id: "rav-toys",
    status: "completed",
    completion: 100,
    setup_completed: true,
    last_updated_at: "2026-07-24T12:00:00.000Z",
    answers: {
      business: {
        brand_name: "RAV Toys",
        contact_email: "ventas@ravtoys.com",
        contact_phone: "+57 300 000 0000"
      },
      meta: {
        whatsapp_number: "+57 300 111 1111"
      },
      operations: {
        business_hours: "Lunes a sábado, 9 a 6.",
        services_products: "Juguetes, carros montables y regalos infantiles.",
        frequent_questions: "Disponibilidad, envíos y garantías.",
        important_policies: "Cambios con factura y producto sin uso."
      },
      team: {
        admin_email: "admin@ravtoys.com",
        human_support_contact: "Equipo RAV por WhatsApp interno."
      }
    }
  },
  commercialReadiness: {
    version: "test",
    stages: [
      { label: "Calificación comercial", owner: "NexforIA", status: "ready" },
      { label: "Meta WhatsApp", owner: "Meta", status: "waiting_meta" }
    ],
    requiredTenantFields: ["tenant_id", "shopify_admin_token"]
  },
  accessModel: {
    version: "test",
    roles: [{ role: "super_admin", level: 4, owner: "NexforIA", scope: "platform", purpose: "Opera plataforma." }],
    future_panels: [{ id: "platform_super_admin", label: "Super admin", owner: "NexforIA", roles: ["super_admin"], purpose: "Opera plataforma." }]
  },
  customerSetupQuestionnaire: {
    version: 1,
    questions: [
      { id: "company_name", path: "business.brand_name", section: "business", order: 10, active: true, required: true, type: "text", label: "Nombre comercial visible", placeholder: "Ej. Mi marca" },
      { id: "frequently_asked_questions", path: "operations.frequent_questions", section: "offering", order: 90, active: true, required: true, type: "textarea", label: "FAQs que debe aprender el bot", placeholder: "Pregunta y respuesta" }
    ]
  }
});

assert.match(contentType, /text\/html/);
assert.match(html, /Panel Super Admin/);
assert.match(html, /data-view="overview"/);
assert.match(html, /data-view="clients"/);
assert.match(html, /data-view="leads"/);
assert.match(html, /data-view="incidents"/);
assert.match(html, /data-view="questionnaire"/);
assert.match(html, /data-view="billing"/);
assert.match(html, /data-view="agendamiento"/);
assert.match(html, /data-view="atencion"/);
assert.match(html, /Bandeja de operación/);
assert.match(html, /\/admin\/assets\/lumen\.png/);
assert.match(html, /class="goal-card"/);
assert.match(html, /mobile-goal-shell/);
assert.match(html, /data-goal-label/);
assert.match(html, /Editar meta de Lumen/);
assert.match(html, /\/admin\/platform-goals\/customers/);
assert.match(html, /Editor del cuestionario de setup/);
assert.match(html, /\/admin\/customer-setup-questionnaire/);
assert.match(html, /Nombre comercial visible/);
assert.match(html, /FAQs que debe aprender el bot/);
assert.match(html, /data-question-id="company_name"/);
assert.match(html, /data-question-field="label"/);
assert.match(html, /Guardar cuestionario/);
assert.match(html, /id="goalTargetInput"/);
assert.match(html, /Camino a 340/);
assert.match(html, /--gradient-cyan/);
assert.match(html, /Grupo Jurídico DERCO/);
assert.match(html, /\/admin\/pilots\/derco/);
assert.match(html, /Cliente #1 · Grupo Jurídico DERCO/);
assert.match(html, /rav-toys · entorno legado/);
assert.doesNotMatch(html, /Cliente #1 · RAV Toys/);
assert.match(html, /Crear acceso RAV/);
assert.match(html, /role="dialog" aria-modal="true"/);
assert.match(html, /Setup del cliente/);
assert.match(html, /Correo administrador/);
assert.match(html, /admin@ravtoys\.com/);
assert.match(html, /Correo de contacto/);
assert.match(html, /ventas@ravtoys\.com/);
assert.match(html, /Teléfono/);
assert.match(html, /WhatsApp/);
assert.match(html, /Horario/);
assert.match(html, /Servicios o productos/);
assert.match(html, /Juguetes, carros montables y regalos infantiles/);
assert.match(html, /Preguntas frecuentes/);
assert.match(html, /Políticas de la empresa/);
assert.match(html, /Soporte humano/);
assert.match(html, /Meta App Review pendiente/);
assert.match(html, /No se muestran datos de ejemplo como si fueran producción/);
assert.doesNotMatch(html, /<script>alert\("x"\)<\/script>/);
assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);

// Sin fuente financiera el panel no inventa cifras.
assert.match(html, /sin fuente financiera conectada/);
assert.match(html, /El Pareto de ingresos aparece con ventas reales/);

// Con fuente financiera conectada el diseño pinta desglose, tabla y Pareto.
let richHtml = "";
renderSuperAdminPanel({
  setHeader: function () {},
  send: function (body) { richHtml = body; }
}, {
  auth: { username: "root", name: "Root", role: "super_admin" },
  botVersion: "v-test",
  tenant: { id: "rav-toys", name: "RAV Toys", status: "active" },
  registeredClients: [],
  commercialReadiness: { stages: [], requiredTenantFields: [] },
  accessModel: { roles: [], future_panels: [] },
  finance: {
    currency: "COP",
    bots: [
      { id: "agendamiento", name: "Agendamiento", clients: 3, mrr: 6000000, users: 420, usersUnit: "citas/mes", costs: 1500000 },
      { id: "atencion", name: "Atención al cliente", clients: 2, mrr: 4000000, users: 1800, usersUnit: "conv./mes", costs: 1200000 }
    ],
    pareto: [
      { name: "Agendamiento", revenue: 6000000, botId: "agendamiento" },
      { name: "Atención al cliente", revenue: 4000000, botId: "atencion" }
    ],
    attention: { webhooks: 2, pendingAppointments: 7, queues: 1, overdue: 0 }
  },
  leads: { kpis: { active: 12, won: 3, demos: 5, conversion: 25 }, sources: [{ name: "Meta Ads", paid: true, leads: 8, won: 2 }] }
});
assert.match(richHtml, /Consolidado/);
assert.match(richHtml, /Pareto de ingresos/);
assert.match(richHtml, /Meta Ads/);
assert.doesNotMatch(richHtml, /sin fuente financiera conectada/);

console.log("super-admin-panel.test.js: ok");
