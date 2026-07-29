"use strict";

const assert = require("assert");
const crypto = require("crypto");
const {
  GoogleCalendarProvider,
  InMemoryAppointmentCalendarStore,
  createAppointmentCalendarConnectionService,
  createCalendarOAuthState,
  readCalendarOAuthState
} = require("./appointment-calendar-connections");

const secret = "appointment-calendar-state-secret-2026";
const state = createCalendarOAuthState(secret, {
  tenant_id: "Grupo Derco!",
  actor_id: "admin@derco.example",
  actor: "Admin DERCO",
  redirect_uri: "https://nextforia.com/admin/appointment-calendar/google/callback",
  return_path: "/admin/panel?tab=appointments"
}, 1000);
const parsed = readCalendarOAuthState(secret, state, 1001);
assert.strictEqual(parsed.tenant_id, "grupo-derco");
assert.strictEqual(parsed.provider, "google");
assert.strictEqual(parsed.actor_id, "admin@derco.example");
assert.strictEqual(readCalendarOAuthState(secret, state.slice(0, -1) + (state.endsWith("x") ? "y" : "x"), 1001), null);
assert.strictEqual(readCalendarOAuthState(secret, state, 1000 + 11 * 60 * 1000), null);

const calls = [];
const axiosClient = {
  async post(url, body, options) {
    calls.push(["post", url, body, options && options.headers && options.headers["content-type"]]);
    assert.strictEqual(options.headers["content-type"], "application/x-www-form-urlencoded");
    if (String(body).includes("grant_type=refresh_token")) {
      return { data: { access_token: "access-refreshed", expires_in: 3600, scope: "https://www.googleapis.com/auth/calendar.events" } };
    }
    return { data: { access_token: "access-1", refresh_token: "refresh-1", expires_in: 3600, scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly" } };
  },
  async get(url, options) {
    calls.push(["get", url, options && options.headers && options.headers.Authorization]);
    assert.match(options.headers.Authorization, /^Bearer access-/);
    return { data: { items: [{ id: "agenda@derco.example", summary: "Agenda DERCO", primary: true }] } };
  }
};

const provider = new GoogleCalendarProvider({
  clientId: "google-client",
  clientSecret: "google-secret",
  redirectUri: "https://nextforia.com/admin/appointment-calendar/google/callback",
  axiosClient
});
assert.strictEqual(provider.configured(), true);
const authUrl = provider.authorizationUrl("signed-state");
assert.match(authUrl, /accounts\.google\.com/);
assert.match(authUrl, /calendar\.events/);
assert.match(authUrl, /access_type=offline/);

(async function run() {
  const store = new InMemoryAppointmentCalendarStore();
  const service = createAppointmentCalendarConnectionService({
    store,
    provider,
    encryptionKey: crypto.randomBytes(32),
    now: function () { return new Date("2026-07-28T12:00:00.000Z"); }
  });
  assert.strictEqual(service.providerConfigured(), true);
  const beginUrl = await service.begin("grupo-derco", { email: "admin@derco.example" }, "signed-state");
  assert.match(beginUrl, /signed-state/);
  let status = await service.get("grupo-derco");
  assert.strictEqual(status.status, "connecting");
  const connected = await service.completeAuthorization({
    tenant_id: "grupo-derco",
    actor: "admin@derco.example",
    code: "code-1"
  });
  assert.strictEqual(connected.status, "connected");
  assert.strictEqual(connected.calendar_summary, "Agenda DERCO");
  assert.strictEqual(connected.account_email, "agenda@derco.example");
  assert.strictEqual(connected.credentials_ciphertext, undefined);
  const stored = await store.get("grupo-derco");
  assert.match(stored.credentials_ciphertext, /^enc:v1:/);
  const verified = await service.verify("grupo-derco", "super_admin");
  assert.strictEqual(verified.status, "connected");
  const disconnected = await service.disconnect("grupo-derco", "super_admin");
  assert.strictEqual(disconnected.status, "disconnected");
  assert.strictEqual((await store.get("grupo-derco")).credentials_ciphertext, null);
  assert(calls.some(function (call) { return call[0] === "post" && /oauth2/.test(call[1]); }));
  console.log("appointment calendar connection tests: ok");
})().catch(function (error) {
  console.error(error);
  process.exit(1);
});
