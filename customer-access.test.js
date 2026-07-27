"use strict";

const assert = require("assert");
const renderCustomerPasswordSetup = require("./customer-access");

function render(options) {
  let status = 0;
  let body = "";
  const headers = {};
  const res = {
    status(value) { status = value; return this; },
    setHeader(name, value) { headers[String(name).toLowerCase()] = value; return this; },
    send(value) { body = String(value); return this; }
  };
  renderCustomerPasswordSetup(res, options);
  return { status, headers, body };
}

const active = render({
  valid: true,
  invite: "test-token",
  email: "admin@empresa-a.test",
  businessName: "Empresa A"
});

assert.strictEqual(active.status, 200);
assert(active.body.includes('value="admin@empresa-a.test" readonly'));
assert(active.body.includes("Empresa A · Invitación verificada"));
assert(!active.body.includes('id="username"'));
assert(!active.body.includes('name="username"'));
assert(!active.body.includes('id="name"'));
assert(active.body.includes("password_confirmation"));
assert(active.body.includes("JSON.stringify({invite:invite,password:passwordInput.value,password_confirmation:confirmationInput.value})"));
assert(!active.body.includes("username:usernameInput"));

const escaped = render({
  valid: true,
  invite: "x</script><script>alert(1)</script>",
  email: 'admin+qa@example.test" autofocus onfocus="alert(1)',
  businessName: "Empresa <script>alert(1)</script>"
});
assert(!escaped.body.includes("<script>alert(1)</script>"));
assert(escaped.body.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
assert(escaped.body.includes("&quot; autofocus onfocus=&quot;alert(1)"));

const invalid = render({ valid: false, status: 410, reason: "La invitación ya fue usada." });
assert.strictEqual(invalid.status, 410);
assert(invalid.body.includes("La invitación ya fue usada."));
assert(!invalid.body.includes('id="setupForm"'));

console.log("customer access UI tests: ok");
