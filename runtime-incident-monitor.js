"use strict";

function clean(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max || 240);
}

function providerErrorDetails(error) {
  const body = error && error.response && error.response.data;
  const providerError = body && body.error || body || {};
  return {
    type: clean(providerError.type || error && error.code || "provider_error", 80),
    message: clean(providerError.message || error && error.message || "provider_request_failed", 240),
    status: Number(error && error.response && error.response.status) || null
  };
}

class RuntimeIncidentMonitor {
  constructor(options) {
    options = options || {};
    this.threshold = Math.max(1, Number(options.threshold) || 3);
    this.windowMs = Math.max(1000, Number(options.windowMs) || 5 * 60 * 1000);
    this.cooldownMs = Math.max(1000, Number(options.cooldownMs) || 30 * 60 * 1000);
    this.now = typeof options.now === "function" ? options.now : Date.now;
    this.entries = new Map();
  }

  failure(provider, tenantId, error) {
    const now = this.now();
    const key = clean(provider, 40) + ":" + clean(tenantId, 120);
    const details = providerErrorDetails(error);
    const previous = this.entries.get(key) || { failures: [], lastAlertAt: 0, lastSuccessAt: 0 };
    const failures = previous.failures.filter(function (timestamp) {
      return now - timestamp <= this.windowMs;
    }, this);
    failures.push(now);
    const shouldAlert = failures.length >= this.threshold && now - previous.lastAlertAt >= this.cooldownMs;
    const entry = {
      failures,
      lastAlertAt: shouldAlert ? now : previous.lastAlertAt,
      lastSuccessAt: previous.lastSuccessAt,
      lastFailureAt: now,
      details
    };
    this.entries.set(key, entry);
    return {
      provider: clean(provider, 40),
      tenant_id: clean(tenantId, 120),
      consecutive_failures: failures.length,
      should_alert: shouldAlert,
      error_type: details.type,
      error_message: details.message,
      status: details.status,
      occurred_at: new Date(now).toISOString()
    };
  }

  success(provider, tenantId) {
    const now = this.now();
    const key = clean(provider, 40) + ":" + clean(tenantId, 120);
    const previous = this.entries.get(key) || { lastAlertAt: 0 };
    this.entries.set(key, Object.assign({}, previous, { failures: [], lastSuccessAt: now }));
  }

  health(provider) {
    const prefix = clean(provider, 40) + ":";
    const incidents = [];
    const now = this.now();
    for (const [key, entry] of this.entries.entries()) {
      if (!key.startsWith(prefix) || !entry.failures || !entry.failures.length) continue;
      const activeFailures = entry.failures.filter(function (timestamp) {
        return now - timestamp <= this.windowMs;
      }, this);
      if (!activeFailures.length) continue;
      incidents.push({
        tenant_id: key.slice(prefix.length),
        consecutive_failures: activeFailures.length,
        last_failure_at: new Date(entry.lastFailureAt).toISOString(),
        error_type: entry.details && entry.details.type || "provider_error"
      });
    }
    return {
      ok: incidents.length === 0,
      active_incidents: incidents.length,
      incidents
    };
  }
}

module.exports = { RuntimeIncidentMonitor, providerErrorDetails };
