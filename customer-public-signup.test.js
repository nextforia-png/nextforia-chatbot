"use strict";

const assert = require("assert");
const vm = require("vm");
const renderCustomerPublicSignup = require("./customer-public-signup");

let html = "";
const res = {
  status: function () { return res; },
  setHeader: function () { return res; },
  send: function (value) { html = value; return res; }
};

renderCustomerPublicSignup(res, {});

assert.match(html, /id="showPasswords" type="checkbox"/);
assert.match(html, /Mostrar contraseñas/);
assert.match(html, /class="fieldError" id="companyNameError"/);
assert.match(html, /class="fieldError" id="emailError"/);
assert.match(html, /class="fieldError" id="contactPhoneError"/);
assert.match(html, /class="fieldError" id="passwordError"/);
assert.match(html, /class="fieldError" id="passwordConfirmationError"/);
assert.match(html, /field\.invalid>input\{border-color:var\(--danger\)/);
assert.match(html, /Corrige los campos señalados en rojo para continuar\./);
assert.doesNotMatch(html, /id="submitButton" type="submit" disabled/);

const scripts = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g)).map(function (match) { return match[1]; });
assert.strictEqual(scripts.length, 1);
assert.doesNotThrow(function () { new vm.Script(scripts[0], { filename: "customer-public-signup-inline.js" }); });

console.log("customer-public-signup.test.js: ok");
