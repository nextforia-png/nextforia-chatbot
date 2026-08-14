"use strict";

const assert = require("assert");
const { RuntimeIncidentMonitor, providerErrorDetails } = require("./runtime-incident-monitor");

let now = Date.parse("2026-08-14T13:00:00.000Z");
const monitor = new RuntimeIncidentMonitor({ now: function () { return now; } });
const error = {
  response: {
    status: 400,
    data: { error: { type: "invalid_request_error", message: "A maximum of 4 blocks with cache_control may be provided. Found 5." } }
  }
};

assert.strictEqual(monitor.failure("anthropic", "tenant-a", error).should_alert, false);
now += 1000;
assert.strictEqual(monitor.failure("anthropic", "tenant-a", error).should_alert, false);
now += 1000;
const third = monitor.failure("anthropic", "tenant-a", error);
assert.strictEqual(third.should_alert, true, "three failures inside five minutes must alert");
assert.strictEqual(third.error_type, "invalid_request_error");
assert.strictEqual(third.status, 400);
assert.strictEqual(monitor.health("anthropic").active_incidents, 1);

monitor.success("anthropic", "tenant-a");
assert.strictEqual(monitor.health("anthropic").ok, true, "a successful request clears the active incident");
monitor.failure("anthropic", "tenant-b", error);
now += 6 * 60 * 1000;
assert.strictEqual(monitor.health("anthropic").ok, true, "expired failures must not keep production unhealthy");
assert.deepStrictEqual(providerErrorDetails(new Error("network down")), {
  type: "provider_error",
  message: "network down",
  status: null
});

console.log("runtime-incident-monitor.test.js ok");
