"use strict";

const crypto = require("crypto");

function text(value, maximum) {
  const clean = String(value || "").trim();
  return maximum ? clean.slice(0, maximum) : clean;
}

function eventIdentifier(destinationId, message) {
  const supplied = text(message && message.id, 500);
  if (supplied) return "whatsapp:" + supplied;
  // Message IDs are expected from Meta. The deterministic fallback keeps an
  // unusual malformed retry idempotent without storing sender content in the
  // primary key.
  return "whatsapp:sha256:" + crypto.createHash("sha256")
    .update(text(destinationId, 500) + ":" + JSON.stringify(message || {}))
    .digest("hex");
}

function extractWhatsAppMessageEvents(body) {
  if (!body || body.object !== "whatsapp_business_account") return [];
  const events = [];
  for (const entry of Array.isArray(body.entry) ? body.entry : []) {
    for (const change of Array.isArray(entry && entry.changes) ? entry.changes : []) {
      const value = change && change.value;
      const destinationId = text(value && value.metadata && value.metadata.phone_number_id, 240);
      for (const message of Array.isArray(value && value.messages) ? value.messages : []) {
        if (!destinationId || !message) continue;
        events.push({
          event_id: eventIdentifier(destinationId, message),
          channel: "whatsapp",
          destination_id: destinationId,
          received_at: new Date().toISOString(),
          payload: { value, message }
        });
      }
    }
  }
  return events;
}

class InMemoryMetaWebhookInboxStore {
  constructor(options) {
    options = options || {};
    this.clock = options.clock || function () { return new Date(); };
    this.rows = new Map();
    this.sequence = 0;
  }

  async enqueue(events) {
    let inserted = 0;
    const current = this.clock().toISOString();
    for (const event of events || []) {
      if (!event || !event.event_id || this.rows.has(event.event_id)) continue;
      this.rows.set(event.event_id, {
        queue_id: ++this.sequence,
        event_id: event.event_id,
        channel: event.channel,
        destination_id: event.destination_id,
        sender_key: crypto.createHash("sha256")
          .update(text(event.payload && event.payload.message && event.payload.message.from, 500))
          .digest("hex"),
        payload: event.payload,
        status: "pending",
        attempts: 0,
        next_attempt_at: current,
        lease_until: null,
        lease_owner: null,
        received_at: event.received_at || current,
        processed_at: null,
        tenant_id: null,
        last_error: null
      });
      inserted++;
    }
    return { accepted: (events || []).length, inserted };
  }

  async claim(owner, leaseSeconds) {
    const now = this.clock();
    const rows = Array.from(this.rows.values());
    const eligible = rows.filter(function (row) {
      const due = Date.parse(row.next_attempt_at || "") <= now.getTime();
      const expired = !row.lease_until || Date.parse(row.lease_until) <= now.getTime();
      const active = row.status === "pending" && due || row.status === "processing" && expired;
      if (!active || row.attempts >= 48 || Date.parse(row.received_at) <= now.getTime() - 72 * 60 * 60 * 1000) {
        return false;
      }
      return !rows.some(function (earlier) {
        return earlier.queue_id < row.queue_id &&
          earlier.destination_id === row.destination_id &&
          earlier.sender_key === row.sender_key &&
          ["pending", "processing"].includes(earlier.status);
      });
    }).sort(function (left, right) {
      return left.queue_id - right.queue_id;
    })[0];
    if (!eligible) return null;
    eligible.status = "processing";
    eligible.attempts += 1;
    eligible.lease_owner = owner;
    eligible.lease_until = new Date(now.getTime() + Math.max(30, leaseSeconds || 120) * 1000).toISOString();
    return Object.assign({}, eligible);
  }

  async complete(eventId, owner, details) {
    const row = this.rows.get(eventId);
    if (!row || row.status !== "processing" || row.lease_owner !== owner) return false;
    row.status = "completed";
    row.processed_at = this.clock().toISOString();
    row.tenant_id = text(details && details.tenant_id, 240) || null;
    row.payload = null;
    row.lease_owner = null;
    row.lease_until = null;
    row.last_error = null;
    return true;
  }

  async heartbeat(eventId, owner, leaseSeconds) {
    const row = this.rows.get(eventId);
    if (!row || row.status !== "processing" || row.lease_owner !== owner) return false;
    row.lease_until = new Date(
      this.clock().getTime() + Math.max(30, leaseSeconds || 180) * 1000
    ).toISOString();
    return true;
  }

  async fail(eventId, owner, error, options) {
    const row = this.rows.get(eventId);
    if (!row || row.status !== "processing" || row.lease_owner !== owner) return false;
    const permanent = options && options.permanent === true || row.attempts >= 48 ||
      Date.parse(row.received_at) <= this.clock().getTime() - 72 * 60 * 60 * 1000;
    row.status = permanent ? "dead_letter" : "pending";
    row.next_attempt_at = permanent
      ? null
      : new Date(this.clock().getTime() + Math.max(1000, Number(options && options.delay_ms) || 1000)).toISOString();
    row.lease_owner = null;
    row.lease_until = null;
    row.last_error = text(error && error.message || error, 500) || "processing_failed";
    return true;
  }

  async list() {
    return Array.from(this.rows.values()).map(function (row) { return Object.assign({}, row); });
  }
}

class SupabaseMetaWebhookInboxStore {
  constructor(options) {
    options = options || {};
    this.url = String(options.url || "").replace(/\/$/, "");
    this.headers = Object.assign({}, options.headers || {});
    this.http = options.axiosClient;
    this.encrypt = options.encrypt;
    this.decrypt = options.decrypt;
    this.senderKey = options.senderKey;
    this.clock = options.clock || function () { return new Date(); };
    this.readyUntil = 0;
    this.readyPromise = null;
    if (!this.url || !this.http || !this.encrypt || !this.decrypt || !this.senderKey) {
      throw new Error("meta_webhook_inbox_store_not_configured");
    }
  }

  async enqueue(events) {
    const payload = (events || []).map((event) => ({
      event_id: event.event_id,
      channel: event.channel,
      destination_id: event.destination_id,
      sender_key: this.senderKey(text(event.payload && event.payload.message && event.payload.message.from, 500)),
      payload_ciphertext: this.encrypt(JSON.stringify(event.payload || {})),
      status: "pending",
      attempts: 0,
      next_attempt_at: event.received_at || this.clock().toISOString(),
      received_at: event.received_at || this.clock().toISOString()
    }));
    if (!payload.length) return { accepted: 0, inserted: 0 };
    await this.http.post(
      this.url + "/rest/v1/meta_webhook_events?on_conflict=event_id",
      payload,
      {
        headers: Object.assign({}, this.headers, {
          Prefer: "resolution=ignore-duplicates,return=minimal"
        }),
        timeout: 8000
      }
    );
    return { accepted: payload.length, inserted: null };
  }

  async assertReady(options) {
    const force = options && options.force === true;
    if (!force && this.readyUntil > this.clock().getTime()) return true;
    if (this.readyPromise) return this.readyPromise;
    const self = this;
    const check = (async function () {
      await self.http.get(self.url + "/rest/v1/meta_webhook_events", {
        params: { select: "event_id", limit: 1 },
        headers: self.headers,
        timeout: 8000
      });
      const response = await self.http.post(
        self.url + "/rest/v1/rpc/meta_webhook_inbox_ready_v1",
        {},
        { headers: self.headers, timeout: 8000 }
      );
      if (response.data !== true) throw new Error("meta_webhook_inbox_rpc_unavailable");
      self.readyUntil = self.clock().getTime() + 30000;
      return true;
    })();
    this.readyPromise = check;
    try {
      return await check;
    } finally {
      if (this.readyPromise === check) this.readyPromise = null;
    }
  }

  async claim(owner, leaseSeconds) {
    const response = await this.http.post(
      this.url + "/rest/v1/rpc/claim_meta_webhook_event_v1",
      { p_owner: owner, p_lease_seconds: Math.max(30, Number(leaseSeconds) || 120) },
      { headers: this.headers, timeout: 10000 }
    );
    const row = Array.isArray(response.data) ? response.data[0] : response.data;
    if (!row || !row.event_id) return null;
    let payload;
    try {
      payload = JSON.parse(this.decrypt(row.payload_ciphertext));
    } catch (error) {
      error.permanent = true;
      error.event_id = row.event_id;
      error.lease_owner = owner;
      throw error;
    }
    const message = payload && payload.message;
    const destinationId = text(payload && payload.value && payload.value.metadata && payload.value.metadata.phone_number_id, 240);
    const expectedEventId = eventIdentifier(destinationId, message);
    const expectedSenderKey = this.senderKey(text(message && message.from, 500));
    if (destinationId !== row.destination_id || expectedEventId !== row.event_id || expectedSenderKey !== row.sender_key) {
      const invalid = new Error("meta_webhook_inbox_integrity_failed");
      invalid.permanent = true;
      invalid.event_id = row.event_id;
      invalid.lease_owner = owner;
      throw invalid;
    }
    return Object.assign({}, row, { payload });
  }

  async heartbeat(eventId, owner, leaseSeconds) {
    const response = await this.http.patch(
      this.url + "/rest/v1/meta_webhook_events",
      {
        lease_until: new Date(
          this.clock().getTime() + Math.max(30, Number(leaseSeconds) || 180) * 1000
        ).toISOString(),
        updated_at: this.clock().toISOString()
      },
      {
        params: { event_id: "eq." + eventId, status: "eq.processing", lease_owner: "eq." + owner },
        headers: Object.assign({}, this.headers, { Prefer: "return=representation" }),
        timeout: 8000
      }
    );
    return Array.isArray(response.data) && response.data.length === 1;
  }

  async complete(eventId, owner, details) {
    const response = await this.http.patch(
      this.url + "/rest/v1/meta_webhook_events",
      {
        status: "completed",
        processed_at: this.clock().toISOString(),
        tenant_id: text(details && details.tenant_id, 240) || null,
        payload_ciphertext: null,
        lease_owner: null,
        lease_until: null,
        last_error: null
      },
      {
        params: { event_id: "eq." + eventId, status: "eq.processing", lease_owner: "eq." + owner },
        headers: Object.assign({}, this.headers, { Prefer: "return=representation" }),
        timeout: 8000
      }
    );
    return Array.isArray(response.data) && response.data.length === 1;
  }

  async fail(eventId, owner, error, options) {
    const permanent = options && options.permanent === true;
    const payload = {
      status: permanent ? "dead_letter" : "pending",
      next_attempt_at: permanent
        ? null
        : new Date(this.clock().getTime() + Math.max(1000, Number(options && options.delay_ms) || 1000)).toISOString(),
      lease_owner: null,
      lease_until: null,
      last_error: text(error && error.message || error, 500) || "processing_failed"
    };
    const response = await this.http.patch(
      this.url + "/rest/v1/meta_webhook_events",
      payload,
      {
        params: { event_id: "eq." + eventId, status: "eq.processing", lease_owner: "eq." + owner },
        headers: Object.assign({}, this.headers, { Prefer: "return=representation" }),
        timeout: 8000
      }
    );
    return Array.isArray(response.data) && response.data.length === 1;
  }
}

function createMetaWebhookInbox(options) {
  options = options || {};
  const store = options.store;
  const processEvent = options.processEvent;
  const log = options.log || function () {};
  const owner = text(options.owner, 200) || "webhook-worker:" + crypto.randomUUID();
  const intervalMs = Math.max(1000, Number(options.interval_ms) || 5000);
  let draining = false;
  let stopped = false;
  let timer = null;

  async function drain() {
    if (draining || stopped) return 0;
    draining = true;
    let processed = 0;
    try {
      while (processed < 100) {
        let row;
        try {
          row = await store.claim(owner, 180);
        } catch (error) {
          if (error && error.event_id) {
            await store.fail(error.event_id, error.lease_owner || owner, error, { permanent: true });
          }
          throw error;
        }
        if (!row) break;
        try {
          const heartbeat = setInterval(function () {
            store.heartbeat(row.event_id, owner, 180).catch(function (error) {
              log("warn", "meta_webhook_heartbeat_failed", {
                event_id_suffix: String(row.event_id || "").slice(-16),
                error: text(error && error.message, 240)
              });
            });
          }, 30000);
          if (heartbeat.unref) heartbeat.unref();
          try {
          const result = await processEvent(row.payload, row);
          await store.complete(row.event_id, owner, result || {});
          } finally {
            clearInterval(heartbeat);
          }
        } catch (error) {
          const permanent = error && error.permanent === true || Number(row.attempts) >= 48;
          const exponent = Math.min(10, Math.max(0, Number(row.attempts) - 1));
          const delayMs = Math.min(30 * 60 * 1000, 1000 * Math.pow(2, exponent));
          await store.fail(row.event_id, owner, error, { permanent, delay_ms: delayMs });
          log("warn", "meta_webhook_event_failed", {
            event_id_suffix: String(row.event_id || "").slice(-16),
            attempts: row.attempts,
            permanent,
            error: text(error && error.message, 240)
          });
        }
        processed++;
      }
      return processed;
    } finally {
      draining = false;
    }
  }

  function kick() {
    if (stopped) return;
    setImmediate(function () { drain().catch(function (error) {
      log("warn", "meta_webhook_inbox_drain_failed", { error: text(error && error.message, 240) });
    }); });
  }

  function start() {
    if (timer || stopped) return;
    timer = setInterval(kick, intervalMs);
    if (timer.unref) timer.unref();
    kick();
  }

  function stop() {
    stopped = true;
    if (timer) clearInterval(timer);
    timer = null;
  }

  return {
    enqueue: async function (events) {
      const result = await store.enqueue(events);
      kick();
      return result;
    },
    drain,
    start,
    stop
  };
}

module.exports = {
  InMemoryMetaWebhookInboxStore,
  SupabaseMetaWebhookInboxStore,
  createMetaWebhookInbox,
  extractWhatsAppMessageEvents
};
