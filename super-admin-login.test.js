"use strict";

const assert = require("assert");
const renderSuperAdminLogin = require("./super-admin-login");

let status = 0;
let contentType = "";
let html = "";
renderSuperAdminLogin({
  status: function (value) { status = value; return this; },
  setHeader: function (name, value) { if (String(name).toLowerCase() === "content-type") contentType = value; },
  send: function (body) { html = body; }
}, {
  currentRole: "admin",
  currentRoleLabel: '<script>Admin cliente</script>'
});

assert.strictEqual(status, 200);
assert.match(contentType, /text\/html/);
assert.match(html, /Acceso Super Admin · NexforIA/);
assert.match(html, /Entrada interna NexforIA/);
assert.match(html, /Este acceso es diferente al Panel de Control de los clientes/);
assert.match(html, /Sesión cliente detectada/);
assert.match(html, /Correo o usuario NexforIA/);
assert.match(html, /¿Olvidaste tu contraseña\?/);
assert.match(html, /Recuperación segura de plataforma/);
assert.match(html, /useMasterKey/);
assert.match(html, /username\.value="clave-maestra"/);
assert.match(html, /payload\.user\.role!=="super_admin"/);
assert.match(html, /\/admin\/super-admin/);
assert.doesNotMatch(html, /<script>Admin cliente<\/script>/);
assert.match(html, /&lt;script&gt;Admin cliente&lt;\/script&gt;/);

console.log("super-admin-login.test.js: ok");
