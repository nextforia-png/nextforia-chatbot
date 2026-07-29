"use strict";

const assert = require("assert");
const {
  cleanHost,
  evaluateAppointmentLiveReadiness
} = require("./appointment-live-check");

assert.strictEqual(cleanHost("https://api.nextforia.com/webhooks/elevenlabs/post-call"), "api.nextforia.com");
assert.strictEqual(cleanHost("API.NextforIA.com/health"), "api.nextforia.com");

let result = evaluateAppointmentLiveReadiness({
  health: { ok: true, bot: { version: "v247-appointment-setup-gate" } },
  dns: { ok: true, host: "api.nextforia.com", addresses: ["203.0.113.10"] },
  webhook: { ok: true, url: "https://api.nextforia.com/webhooks/elevenlabs/post-call", status: 401 },
  expectedVersion: "v247-appointment-setup-gate",
  fullHealth: {
    appointment_readiness: {
      production_can_be_enabled: true,
      production_ready: false,
      blockers: []
    }
  }
});
assert.strictEqual(result.ok, true);
assert.deepStrictEqual(result.failures, []);

result = evaluateAppointmentLiveReadiness({
  health: { ok: true, bot: { version: "v246" } },
  dns: { ok: false, host: "api.nextforia.com", error: "ENOTFOUND" },
  webhook: { ok: false, url: "https://api.nextforia.com/webhooks/elevenlabs/post-call", status: 0, error: "getaddrinfo ENOTFOUND api.nextforia.com" },
  expectedVersion: "v247-appointment-setup-gate",
  fullHealth: {
    appointment_readiness: {
      production_can_be_enabled: false,
      production_ready: false,
      blockers: ["calendar_not_connected", "elevenlabs_agent_not_configured"]
    }
  }
});
assert.strictEqual(result.ok, false);
assert(result.failures.some(function (failure) { return /Versión desplegada/.test(failure); }));
assert(result.failures.some(function (failure) { return /DNS no resuelve/.test(failure); }));
assert(result.failures.some(function (failure) { return /Webhook ElevenLabs/.test(failure); }));
assert(result.failures.some(function (failure) { return /calendar_not_connected/.test(failure); }));

result = evaluateAppointmentLiveReadiness({
  health: { ok: true, bot: { version: "v247-appointment-setup-gate" } },
  dns: { ok: true, host: "api.nextforia.com", addresses: ["203.0.113.10"] },
  webhook: { ok: true, url: "https://api.nextforia.com/webhooks/elevenlabs/post-call", status: 401 },
  expectedVersion: "v247-appointment-setup-gate",
  requireDashboardKey: true
});
assert.strictEqual(result.ok, false);
assert(result.failures.some(function (failure) { return /DASHBOARD_KEY/.test(failure); }));

result = evaluateAppointmentLiveReadiness({
  health: { ok: true, bot: { version: "v247-appointment-setup-gate" } },
  dns: { ok: true, host: "api.nextforia.com", addresses: ["203.0.113.10"] },
  webhook: { ok: true, url: "https://api.nextforia.com/webhooks/elevenlabs/post-call", status: 401 },
  expectedVersion: "v247-appointment-setup-gate",
  requirePublicEnabled: true,
  fullHealth: {
    appointment_readiness: {
      production_can_be_enabled: true,
      production_ready: false,
      blockers: []
    }
  }
});
assert.strictEqual(result.ok, false);
assert(result.failures.some(function (failure) { return /APPOINTMENTS_PUBLIC_ENABLED/.test(failure); }));

result = evaluateAppointmentLiveReadiness({
  health: { ok: true, bot: { version: "v247-appointment-setup-gate" } },
  dns: { ok: true, host: "api.nextforia.com", addresses: ["203.0.113.10"] },
  webhook: { ok: false, url: "https://api.nextforia.com/webhooks/elevenlabs/post-call", status: 503 },
  expectedVersion: "v247-appointment-setup-gate",
  fullHealth: {
    appointment_readiness: {
      production_can_be_enabled: true,
      production_ready: false,
      blockers: []
    }
  }
});
assert.strictEqual(result.ok, false);
assert(result.failures.some(function (failure) { return /status_503/.test(failure); }));

console.log("appointment live check tests: ok");
