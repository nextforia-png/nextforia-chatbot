"use strict";

const assert = require("assert");
const {
  PUBLIC_ORIGIN,
  SUPPORT_EMAIL,
  renderGoogleOAuthHomepage,
  renderPrivacyPolicy,
  renderTermsOfService
} = require("./google-oauth-public-pages");

const home = renderGoogleOAuthHomepage();
const privacy = renderPrivacyPolicy();
const terms = renderTermsOfService();

assert.strictEqual(PUBLIC_ORIGIN, "https://api.nextforia.com");
assert.strictEqual(SUPPORT_EMAIL, "nextforia@gmail.com");
assert.match(home, /Nextfor Appointment Bot/);
assert.match(home, /<title>Nextfor Appointment Bot<\/title>/);
assert.match(home, /href="\/nextfor-appointment-bot"/);
assert.match(home, /Its purpose is to check availability/);
assert.match(home, /href="\/privacy"/);
assert.match(home, /href="\/terms"/);
assert.match(home, /No vendemos estos datos/);
assert.match(privacy, /Política de Datos de Usuario de los Servicios de API de Google/);
assert.match(privacy, /Uso Limitado/);
assert.match(privacy, /credenciales OAuth almacenadas/);
assert.match(privacy, /no los usamos para entrenar modelos generales de IA/);
assert.match(terms, /Integración con Google Calendar/);
assert.match(terms, /leyes de Colombia/);

console.log("google oauth public pages tests: ok");
