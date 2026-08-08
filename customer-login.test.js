"use strict";

const assert = require("assert");
const renderCustomerLogin = require("./customer-login");
const { renderResetPassword } = require("./customer-password-recovery");

function render(options) {
  let status = 0;
  let html = "";
  const headers = {};
  renderCustomerLogin({
    status(code) { status = code; return this; },
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
    send(value) { html = value; }
  }, options);
  return { status, headers, html };
}

const page = render({ targetPath: "/admin/panel?tab=summary" });
assert.strictEqual(page.status, 200);
assert.match(page.headers["content-type"], /text\/html/);
assert.match(page.html, /id="email" type="email"/);
assert.match(page.html, /JSON\.stringify\(\{email:/);
assert.doesNotMatch(page.html, /id="username"/);
assert.doesNotMatch(page.html, /Crear una cuenta nueva/);
assert.match(page.html, /Crea tu cuenta/);
assert.match(page.html, /\/admin\/create-account/);
assert.match(page.html, /¿Olvidaste tu contraseña\?/);
assert.match(page.html, /\/admin\/forgot-password/);
assert.match(page.html, /\/admin\/panel\?tab=summary/);

const escapedTarget = render({ targetPath: "</script><script>alert(1)</script>" });
assert.doesNotMatch(escapedTarget.html, /<script>alert\(1\)<\/script>/);

let resetHtml = "";
renderResetPassword({
  status() { return this; },
  setHeader() {},
  send(value) { resetHtml = value; }
}, "");
assert.match(resetHtml, /id="showPassword" type="checkbox"/);
assert.match(resetHtml, />Ver contraseña</);
assert.match(resetHtml, /s\.checked\?"text":"password"/);
assert.match(resetHtml, /p\.type=type;c\.type=type/);

console.log("customer login UI tests: ok");
