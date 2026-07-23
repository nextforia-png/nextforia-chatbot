// El panel no debe entrar en bucle de recarga cuando una llamada de fondo
// (bot-setup, panel/health) responde 401 para un tenant v2 no-default.
// Regla: api() solo redirige al login si quien llama lo pide explícitamente
// (redirectOnAuth), y solo el request principal de datos lo pide.
const assert = require("node:assert");
const vm = require("node:vm");
const renderCustomerPanel = require("./customer-panel");

function clientScript() {
  let html = "";
  const res = { setHeader() {}, type() { return res; }, status() { return res; }, send(v) { html = v; }, end(v) { if (v) html = v; } };
  renderCustomerPanel(res, { auth: { name: "QA", role: "admin" }, capabilities: {}, tenantContext: { id: "b", company_name: "Empresa B", plan_id: "scale", assigned_bot_id: "agendamiento" } });
  return /<script>([\s\S]*)<\/script>/.exec(html)[1];
}

const script = clientScript();

// Extrae solo la función api() y la ejecuta en un sandbox con mocks.
function loadApi(fetchStatus, locationRef) {
  const apiSrc = /function api\(url,opts\)\{[\s\S]*?\n\}/.exec(script + "\n");
  assert.ok(apiSrc, "no encontré la función api() en el script de cliente");
  const sandbox = {
    PANEL_LOGIN_PATH: "/admin/panel",
    location: locationRef,
    fetch: function () {
      return Promise.resolve({
        status: fetchStatus,
        ok: fetchStatus >= 200 && fetchStatus < 300,
        json: function () { return Promise.resolve({ error: "unauthorized" }); }
      });
    },
    Promise, Error, Object
  };
  vm.createContext(sandbox);
  vm.runInContext(apiSrc[0], sandbox);
  return sandbox.api;
}

(async function () {
  // 1) Llamada de fondo (sin flag): 401 NO debe redirigir.
  let loc = { href: "/admin/panel?tab=summary" };
  let api = loadApi(401, loc);
  let threw = null;
  try { await api("/admin/bot-setup"); } catch (e) { threw = e; }
  assert.ok(threw, "una 401 debe rechazar la promesa");
  assert.strictEqual(threw.status, 401, "el error debe llevar status 401");
  assert.strictEqual(loc.href, "/admin/panel?tab=summary", "una llamada de fondo NO debe cambiar location.href");

  // 2) /admin/panel/health igual: sin redirect.
  loc = { href: "/admin/panel?tab=summary" };
  api = loadApi(401, loc);
  try { await api("/admin/panel/health"); } catch (e) {}
  assert.strictEqual(loc.href, "/admin/panel?tab=summary", "panel/health de fondo no redirige");

  // 3) Request principal (redirectOnAuth:true): 401 real SÍ redirige al login.
  loc = { href: "/admin/panel?tab=summary" };
  api = loadApi(401, loc);
  try { await api("/admin/panel/data", { redirectOnAuth: true }); } catch (e) {}
  assert.strictEqual(loc.href, "/admin/panel", "el request principal sí redirige en sesión vencida real");

  // 4) 200 nunca redirige y devuelve el cuerpo.
  loc = { href: "/admin/panel" };
  api = loadApi(200, loc);
  const body = await api("/admin/panel/data", { redirectOnAuth: true });
  assert.deepStrictEqual(body, { error: "unauthorized" }, "un 200 resuelve con el cuerpo");
  assert.strictEqual(loc.href, "/admin/panel", "un 200 no toca location");

  // 5) En el código: solo loadPanelData pide el redirect; las de fondo no.
  assert.ok(/api\(PANEL_DATA_PATH,\{redirectOnAuth:true\}\)/.test(script), "loadPanelData debe pedir redirectOnAuth");
  assert.ok(/api\(PANEL_SETUP_PATH\)/.test(script), "loadBotSetup no debe pedir redirect");
  assert.ok(/api\(PANEL_HEALTH_PATH\)/.test(script), "loadPanelHealth no debe pedir redirect");
  assert.ok(!/api\(PANEL_SETUP_PATH,\{redirectOnAuth/.test(script), "bot-setup nunca redirige");
  assert.ok(!/api\(PANEL_HEALTH_PATH,\{redirectOnAuth/.test(script), "panel/health nunca redirige");

  console.log("customer-panel-auth-redirect.test.js OK");
})().catch(function (e) { console.error(e); process.exit(1); });
