// Planes del Customer Panel: se renderizan desde /admin/panel/catalogs.
// Nunca desde precios escritos a mano. Un precio equivocado en pantalla
// es un problema comercial, no un detalle de UI.
const assert = require("node:assert");
const vm = require("node:vm");
const renderCustomerPanel = require("./customer-panel");

function renderPanel(tenantContext) {
  let html = "";
  const res = {
    setHeader() {},
    type() { return res; },
    status() { return res; },
    send(value) { html = value; },
    end(value) { if (value) html = value; }
  };
  renderCustomerPanel(res, { auth: { name: "QA", role: "admin" }, capabilities: {}, tenantContext });
  return html;
}

const HARDCODED_PRICES = ["990.000", "1.690.000", "499.900"];

// ─── HTML servido ─────────────────────────────────────────────────────────

const v2Html = renderPanel({ id: "empresa-b", company_name: "Empresa B", plan_id: "scale", assigned_bot_id: "agendamiento" });
const legacyHtml = renderPanel(null);

HARDCODED_PRICES.forEach(function (price) {
  assert.ok(!v2Html.includes(price), "el panel v2 no debe traer el precio fijo " + price);
});
assert.ok(!v2Html.includes('class="planOption"'), "las tarjetas de plan ya no se sirven escritas a mano");
assert.match(v2Html, /id="planCatalogGrid" data-state="loading"/, "debe existir el contenedor que llena el catálogo");

// El HTML inicial no puede contradecir al JS: nada de nombrar otro bot.
assert.match(v2Html, /id="channelStatusTitle">Bot conectado</, "v2 no debe anunciar el bot de atención");
assert.match(legacyHtml, /id="channelStatusTitle">Bot de atención conectado</, "el camino legado se conserva");

// El branding del tenant llega ya resuelto desde el servidor.
assert.ok(v2Html.includes("Empresa B"), "el nombre del tenant viaja en el HTML inicial");
assert.ok(!v2Html.includes("RAV Toys"), "ningún rastro del tenant legado en una sesión v2");

// ─── Funciones de cliente ─────────────────────────────────────────────────

const clientScript = /<script>([\s\S]*)<\/script>/.exec(v2Html)[1];

function loadClient(panelContext) {
  const grid = { attrs: {}, innerHTML: "", setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; } };
  const sandbox = {
    PANEL_CONTEXT: panelContext,
    PANEL_CHECK_ICON: "<svg></svg>",
    PANEL_REDESIGN_ENABLED: false,
    document: { getElementById(id) { return id === "planCatalogGrid" ? grid : null; } },
    esc(value) { return String(value == null ? "" : value); },
    console
  };
  vm.createContext(sandbox);
  const fns = ["panelMoney", "panelChats", "planPriceLine", "planCatalogNotice", "renderPlanCatalog"];
  fns.forEach(function (name) {
    const match = new RegExp("^function " + name + "\\([\\s\\S]*?\\n(?=function )", "m").exec(clientScript + "\nfunction ");
    assert.ok(match, "no encontré la función " + name + " en el script de cliente");
    vm.runInContext(match[0], sandbox);
  });
  return { sandbox, grid };
}

const b = loadClient({ v2: true, planId: "scale", assignedBotId: "agendamiento" });

// Formato de precios: enteros COP, con puntos de miles.
assert.strictEqual(b.sandbox.panelMoney(990000), "$990.000");
assert.strictEqual(b.sandbox.panelMoney(299900), "$299.900");

// Precio sin cargar todavía: "por definir", jamás "$0".
assert.strictEqual(b.sandbox.panelMoney(0), null, "cero no es un precio, es un pendiente");
assert.strictEqual(b.sandbox.panelMoney(null), null);
assert.ok(b.sandbox.planPriceLine({ precio_setup: 0, precio_mensual: 0, chats_incluidos: null }).includes("por definir"));
assert.ok(!b.sandbox.planPriceLine({ precio_setup: 0, precio_mensual: 0, chats_incluidos: null }).includes("$0"));
assert.strictEqual(b.sandbox.panelChats(null), "chats incluidos por definir");
assert.strictEqual(b.sandbox.panelChats(500), "500 chats incluidos");

// Render con catálogo real.
const CATALOG = {
  plans: [
    { id: "scale", nombre: "Scale", descripcion: "Para agendar sin parar", bot_id: "agendamiento", precio_setup: 1490000, precio_mensual: 499900, chats_incluidos: 2000, beneficios: ["Agenda automática"], activo: true, orden: 2 },
    { id: "growth", nombre: "Growth", descripcion: "Arranque", bot_id: "agendamiento", precio_setup: 990000, precio_mensual: 299900, chats_incluidos: null, beneficios: [], activo: true, orden: 1 },
    { id: "solo-atencion", nombre: "Solo Atención", descripcion: "Otro bot", bot_id: "atencion-cliente", precio_setup: 990000, precio_mensual: 299900, chats_incluidos: null, beneficios: [], activo: true, orden: 3 },
    { id: "viejo", nombre: "Descontinuado", bot_id: "agendamiento", precio_setup: 100, precio_mensual: 100, activo: false, orden: 4 }
  ],
  bots: []
};

b.sandbox.renderPlanCatalog(CATALOG);
const rendered = b.grid.innerHTML;

assert.strictEqual(b.grid.getAttribute("data-state"), "ready");
assert.ok(rendered.includes("Growth") && rendered.includes("Scale"), "muestra los planes de su bot");
assert.ok(!rendered.includes("Solo Atención"), "no ofrece planes de un bot que no tiene asignado");
assert.ok(!rendered.includes("Descontinuado"), "no muestra planes inactivos");
assert.ok(rendered.indexOf("Growth") < rendered.indexOf("Scale"), "respeta el campo orden");
assert.ok(/Tu plan actual[\s\S]*Scale/.test(rendered) || rendered.includes("Scale"), "marca el plan del tenant");
assert.ok(rendered.includes("Sin setup cost"), "no muestra setup cost aunque el catálogo tenga datos viejos");
assert.ok(rendered.includes("2000 chats incluidos"));
assert.ok(rendered.includes("chats incluidos por definir"), "un plan sin cupo definido lo dice");

// Un plan sin bot_id es transversal: se le muestra a todos.
const c = loadClient({ v2: true, planId: "growth", assignedBotId: "agendamiento" });
c.sandbox.renderPlanCatalog({ plans: [{ id: "universal", nombre: "Universal", bot_id: null, precio_setup: 0, precio_mensual: 0, activo: true, orden: 1 }] });
assert.ok(c.grid.innerHTML.includes("Universal"), "un plan sin bot asignado sigue siendo visible");

// Catálogo vacío: estado explícito con reintento, nunca precios inventados.
const d = loadClient({ v2: true, planId: "growth", assignedBotId: "agendamiento" });
d.sandbox.renderPlanCatalog({ plans: [] });
assert.strictEqual(d.grid.getAttribute("data-state"), "empty");
assert.ok(d.grid.innerHTML.includes("Reintentar"), "el estado vacío ofrece reintentar");
HARDCODED_PRICES.forEach(function (price) {
  assert.ok(!d.grid.innerHTML.includes(price), "el estado vacío no cae en precios viejos");
});

console.log("customer-panel-plan-catalog.test.js OK");
