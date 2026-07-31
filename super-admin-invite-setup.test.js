"use strict";

const assert = require("assert");
const vm = require("vm");
const renderSuperAdminInviteSetup = require("./super-admin-invite-setup");

let status = 0;
let contentType = "";
let html = "";
renderSuperAdminInviteSetup({
  status: function (value) { status = value; return this; },
  setHeader: function (name, value) { if (String(name).toLowerCase() === "content-type") contentType = value; },
  send: function (body) { html = body; }
}, {
  valid: true,
  invite: "token<script>",
  email: "socio@example.com",
  nameHint: '<script>alert("x")</script>'
});

assert.strictEqual(status, 200);
assert.match(contentType, /text\/html/);
assert.match(html, /Crear tu acceso Super Admin|Crea tu acceso Super Admin/);
assert.match(html, /socio@example\.com/);
assert.match(html, /Crear acceso Super Admin/);
assert.match(html, /fetch\(location\.pathname/);
assert.match(html, /password_confirmation/);
assert.doesNotMatch(html, /<script>alert\("x"\)<\/script>/);
assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
assert.match(html, /token\\u003cscript>/);

const inlineScript = html.match(/<script>([\s\S]*?)<\/script>/);
assert(inlineScript, "Super Admin invite setup must render script");
assert.doesNotThrow(function () {
  new vm.Script(inlineScript[1], { filename: "super-admin-invite-setup-inline.js" });
});

let invalidHtml = "";
renderSuperAdminInviteSetup({
  status: function (value) { status = value; return this; },
  setHeader: function () {},
  send: function (body) { invalidHtml = body; }
}, {
  valid: false,
  status: 410,
  reason: '<b>vencida</b>'
});

assert.strictEqual(status, 410);
assert.match(invalidHtml, /No pudimos validar este enlace/);
assert.doesNotMatch(invalidHtml, /<b>vencida<\/b>/);
assert.match(invalidHtml, /&lt;b&gt;vencida&lt;\/b&gt;/);

console.log("super-admin-invite-setup.test.js: ok");
