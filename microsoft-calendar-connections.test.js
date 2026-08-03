"use strict";

const assert = require("assert");
const crypto = require("crypto");
const {
  MicrosoftCalendarProvider,
  InMemoryAppointmentCalendarStore,
  createAppointmentCalendarConnectionService,
  createCalendarOAuthState,
  readCalendarOAuthState
} = require("./appointment-calendar-connections");

const redirectUri = "https://nextforia.com/admin/appointment-calendar/microsoft/callback";
const stateSecret = "microsoft-calendar-state-secret-2026";
const state = createCalendarOAuthState(stateSecret, {
  tenant_id: "tenant-microsoft",
  provider: "microsoft",
  actor_id: "admin@contoso.example",
  actor: "Admin Contoso",
  redirect_uri: redirectUri
}, 1000);
assert.strictEqual(readCalendarOAuthState(stateSecret, state, 1001).provider, "microsoft");

const calls = [];
let calendarCreated = false;
const axiosClient = {
  async post(url, body, options) {
    calls.push(["post", url, body]);
    if (/\/oauth2\/v2\.0\/token$/.test(url)) {
      assert.strictEqual(options.headers["content-type"], "application/x-www-form-urlencoded");
      return { data: {
        access_token: "microsoft-access",
        refresh_token: "microsoft-refresh",
        expires_in: 3600,
        scope: "User.Read Calendars.ReadWrite offline_access"
      } };
    }
    if (/\/me\/calendars$/.test(url)) {
      assert.strictEqual(body.name, "Citas NextforIA");
      calendarCreated = true;
      return { data: { id: "microsoft-nextfor-calendar", name: "Citas NextforIA" } };
    }
    if (/\/events$/.test(url)) {
      assert.strictEqual(body.subject, "Consulta · Cliente Contoso");
      assert.strictEqual(body.start.timeZone, "UTC");
      return { data: {
        id: "microsoft-event-1",
        webLink: "https://outlook.office.com/calendar/item/1",
        showAs: "busy"
      } };
    }
    throw new Error("unexpected_post_" + url);
  },
  async get(url, options) {
    calls.push(["get", url, options && options.params]);
    assert.match(options.headers.Authorization, /^Bearer microsoft-access/);
    if (/\/me\/calendars$/.test(url)) {
      return { data: { value: [
        { id: "microsoft-primary", name: "Calendar", isDefaultCalendar: true },
        ...(calendarCreated ? [{ id: "microsoft-nextfor-calendar", name: "Citas NextforIA" }] : [])
      ] } };
    }
    if (/\/calendarView$/.test(url)) return { data: { value: [] } };
    if (/\/me$/.test(url)) {
      return { data: {
        displayName: "Contoso Admin",
        mail: "admin@contoso.example",
        userPrincipalName: "admin@contoso.example"
      } };
    }
    throw new Error("unexpected_get_" + url);
  },
  async patch(url, body) {
    calls.push(["patch", url, body]);
    return { data: {
      id: "microsoft-event-1",
      webLink: "https://outlook.office.com/calendar/item/1",
      showAs: "busy"
    } };
  },
  async delete(url) {
    calls.push(["delete", url]);
    return { status: 204 };
  }
};

const provider = new MicrosoftCalendarProvider({
  clientId: "microsoft-client",
  clientSecret: "microsoft-secret",
  redirectUri,
  axiosClient
});
assert.strictEqual(provider.configured(), true);
const authUrl = new URL(provider.authorizationUrl("signed-state"));
assert.strictEqual(authUrl.hostname, "login.microsoftonline.com");
assert.strictEqual(authUrl.pathname, "/common/oauth2/v2.0/authorize");
assert.strictEqual(authUrl.searchParams.get("response_mode"), "query");
assert.match(authUrl.searchParams.get("scope"), /Calendars\.ReadWrite/);
assert.match(authUrl.searchParams.get("scope"), /offline_access/);

(async function run() {
  const store = new InMemoryAppointmentCalendarStore();
  const service = createAppointmentCalendarConnectionService({
    store,
    providers: { microsoft: provider },
    encryptionKey: crypto.randomBytes(32),
    now: function () { return new Date("2026-08-03T20:00:00.000Z"); }
  });
  assert.strictEqual(service.providerConfigured("microsoft"), true);
  assert.strictEqual(service.providerConfigured("google"), false);
  const beginUrl = await service.begin("tenant-microsoft", "microsoft", "admin@contoso.example", "signed-state");
  assert.match(beginUrl, /microsoftonline\.com/);
  const connected = await service.completeAuthorization({
    tenant_id: "tenant-microsoft",
    provider: "microsoft",
    actor: "admin@contoso.example",
    redirect_uri: redirectUri,
    code: "microsoft-code"
  });
  assert.strictEqual(connected.provider, "microsoft");
  assert.strictEqual(connected.status, "connected");
  assert.strictEqual(connected.account_email, "admin@contoso.example");
  assert.strictEqual(connected.calendar_summary, "Citas NextforIA");
  assert.deepStrictEqual(connected.availability_calendar_ids, ["microsoft-primary", "microsoft-nextfor-calendar"]);

  const availability = await service.checkAvailability("tenant-microsoft", "2026-08-04T15:00:00.000Z", 30, "admin");
  assert.strictEqual(availability.available, true);
  assert.strictEqual(availability.ends_at, "2026-08-04T15:30:00.000Z");
  assert.strictEqual(calls.filter(function (call) { return call[0] === "get" && /calendarView$/.test(call[1]); }).length, 2);

  const synced = await service.syncAppointment("tenant-microsoft", {
    tenant_id: "tenant-microsoft",
    conversation_id: "conversation-1",
    starts_at: "2026-08-04T15:00:00.000Z",
    duration_minutes: 30,
    customer_name: "Cliente Contoso",
    consultation_reason: "Consulta"
  }, "admin");
  assert.strictEqual(synced.calendar_event_id, "microsoft-event-1");
  assert.match(synced.calendar_event_link, /outlook\.office\.com/);

  await service.syncAppointment("tenant-microsoft", Object.assign({
    tenant_id: "tenant-microsoft",
    conversation_id: "conversation-1",
    starts_at: "2026-08-04T16:00:00.000Z",
    duration_minutes: 30,
    customer_name: "Cliente Contoso",
    consultation_reason: "Consulta"
  }, synced), "admin");
  await service.cancelAppointment("tenant-microsoft", synced, "admin");
  assert(calls.some(function (call) { return call[0] === "patch" && /microsoft-event-1$/.test(call[1]); }));
  assert(calls.some(function (call) { return call[0] === "delete" && /microsoft-event-1$/.test(call[1]); }));
  console.log("microsoft calendar connection tests: ok");
})().catch(function (error) {
  console.error(error);
  process.exit(1);
});
