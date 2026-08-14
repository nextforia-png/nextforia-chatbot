"use strict";

const assert = require("assert");
const crypto = require("crypto");
const { decryptStoredText, encryptStoredText } = require("./security");
const {
  ChannelConnectionError,
  InMemoryChannelConnectionStore,
  MigratingChannelConnectionStore,
  SupabaseChannelConnectionStore,
  createChannelConnectionService,
  publicConnection
} = require("./channel-connections");

function expectCode(promise, code) {
  return promise.then(function () {
    assert.fail("Expected " + code);
  }, function (error) {
    assert(error instanceof ChannelConnectionError);
    assert.strictEqual(error.code, code);
  });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise(function (resolvePromise, rejectPromise) {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function candidate(phone, waba) {
  return {
    id: "wa:" + phone,
    account_id: phone,
    account_label: "+57 300 000 " + phone.slice(-4),
    meta_business_id: "business-" + waba,
    whatsapp_business_account_id: waba,
    phone_number_id: phone,
    access_token: "secret-token-" + phone,
    onboarding_mode: "cloud_api",
    coexistence: false,
    coexistence_event_confirmed: false
  };
}

function coexistenceCandidate(phone, waba) {
  return Object.assign(candidate(phone, waba), {
    onboarding_mode: "coexistence",
    coexistence: true,
    coexistence_event_confirmed: true
  });
}

function providerFor(options) {
  const settings = options || {};
  return {
    configured: function () { return true; },
    authorizationUrl: function () { return "https://www.facebook.com/embedded-signup"; },
    prepareEmbeddedWhatsApp: async function (_, session) {
      if (settings.onPrepare) return settings.onPrepare(session);
      return candidate(session.phone_number_id, session.waba_id);
    },
    registerWhatsApp: async function (asset) {
      if (settings.onRegister) return settings.onRegister(asset);
      return { ok: true };
    },
    subscribe: async function (channel, asset) {
      assert.strictEqual(channel, "whatsapp");
      if (settings.onSubscribe) return settings.onSubscribe(asset);
      return { ok: true };
    },
    verify: async function (channel, asset) {
      assert.strictEqual(channel, "whatsapp");
      if (settings.onVerify) return settings.onVerify(asset);
      return { ok: true, account_label: asset.account_label };
    },
    disconnect: async function (channel, asset) {
      if (settings.onDisconnect) return settings.onDisconnect(channel, asset);
      return { ok: true };
    }
  };
}

(async function run() {
  const encryptionKey = crypto.randomBytes(32);
  const now = function () { return new Date("2026-08-08T23:00:00.000Z"); };

  const freshAwaitingMeta = publicConnection({
    tenant_id: "tenant-fresh-awaiting-meta",
    channel: "whatsapp",
    status: "connecting",
    onboarding_attempt_id: "attempt-fresh-awaiting-meta",
    onboarding_attempt_status: "awaiting_meta",
    onboarding_attempt_started_at: "2026-08-08T22:59:00.000Z"
  }, { now: now() });
  assert.strictEqual(freshAwaitingMeta.status, "connecting");
  assert.strictEqual(freshAwaitingMeta.onboarding_attempt_stage, "awaiting_meta");

  const staleAwaitingMeta = publicConnection({
    tenant_id: "tenant-stale-awaiting-meta",
    channel: "whatsapp",
    status: "connecting",
    onboarding_attempt_id: "attempt-stale-awaiting-meta",
    onboarding_attempt_status: "awaiting_meta",
    onboarding_attempt_started_at: "2026-08-08T22:55:00.000Z"
  }, { now: now() });
  assert.strictEqual(staleAwaitingMeta.status, "needs_attention");
  assert.strictEqual(staleAwaitingMeta.onboarding_attempt_stage, "authorization_incomplete");
  assert.strictEqual(staleAwaitingMeta.cancel_attempt_available, true);
  assert(staleAwaitingMeta.onboarding_attempt_message.includes("Meta no devolvió"));
  assert(staleAwaitingMeta.onboarding_attempt_message.includes("no registró ni modificó"));

  const cutoverPrimary = new InMemoryChannelConnectionStore();
  const cutoverFallback = new InMemoryChannelConnectionStore();
  await cutoverFallback.upsert({
    tenant_id: "tenant-cutover",
    channel: "whatsapp",
    status: "connected",
    phone_number_id: "phone-old",
    whatsapp_business_account_id: "waba-old",
    updated_at: "2026-08-01T00:00:00.000Z"
  });
  await cutoverPrimary.upsert({
    tenant_id: "tenant-cutover",
    channel: "whatsapp",
    status: "connected",
    phone_number_id: "phone-new",
    whatsapp_business_account_id: "waba-new",
    updated_at: "2026-08-08T00:00:00.000Z"
  });
  const cutoverStore = new MigratingChannelConnectionStore({
    primary: cutoverPrimary,
    fallback: cutoverFallback
  });
  await cutoverStore.assertWhatsAppOnboardingReady();
  assert.strictEqual(cutoverStore.primaryAuthoritative, true);
  assert.strictEqual((await cutoverStore.get("tenant-cutover", "whatsapp")).phone_number_id, "phone-new",
    "a newer legitimate primary number must supersede the old append-only owner");
  cutoverFallback.listAllStrictForCutover = async function () { throw new Error("legacy_scan_unavailable"); };
  await assert.rejects(cutoverStore.assertWhatsAppOnboardingReady({ force: true }));
  assert.strictEqual(cutoverStore.whatsappOnboardingReady, false, "a failed recheck must pause new onboarding");
  assert.strictEqual(cutoverStore.primaryAuthoritative, true, "runtime authority must remain sticky after cutover");
  assert.strictEqual((await cutoverStore.get("tenant-cutover", "whatsapp")).phone_number_id, "phone-new");

  const diagnosticPrimary = new InMemoryChannelConnectionStore();
  const diagnosticFallback = new InMemoryChannelConnectionStore();
  await diagnosticFallback.upsert({
    tenant_id: "tenant-diagnostic",
    channel: "whatsapp",
    status: "needs_attention",
    phone_number_id: "phone-12345678",
    whatsapp_business_account_id: "waba-87654321",
    updated_at: "2026-08-08T12:00:00.000Z"
  });
  diagnosticPrimary.upsert = async function () {
    throw new ChannelConnectionError("channel_asset_already_assigned", 409);
  };
  const diagnosticStore = new MigratingChannelConnectionStore({
    primary: diagnosticPrimary,
    fallback: diagnosticFallback
  });
  await assert.rejects(
    diagnosticStore.assertWhatsAppOnboardingReady(),
    function (error) {
      return error instanceof ChannelConnectionError &&
        error.code === "channel_store_unavailable" &&
        /tenant=tenant-diagnostic channel=whatsapp/.test(error.internalMessage) &&
        /phone_suffix=12345678/.test(error.internalMessage) &&
      /waba_suffix=87654321/.test(error.internalMessage);
    }
  );

  const orphanPrimary = new InMemoryChannelConnectionStore();
  const orphanFallback = new InMemoryChannelConnectionStore();
  await orphanPrimary.upsert({
    tenant_id: "canonical-tenant",
    channel: "whatsapp",
    status: "connected",
    phone_number_id: "shared-phone",
    whatsapp_business_account_id: "shared-waba",
    updated_at: "2026-08-08T12:00:00.000Z"
  });
  await orphanFallback.upsert({
    tenant_id: "removed-tenant",
    channel: "whatsapp",
    status: "connected",
    phone_number_id: "shared-phone",
    whatsapp_business_account_id: "shared-waba",
    updated_at: "2026-08-01T12:00:00.000Z"
  });
  orphanPrimary.tenantExists = async function (tenantId) {
    return tenantId === "canonical-tenant";
  };
  const orphanStore = new MigratingChannelConnectionStore({
    primary: orphanPrimary,
    fallback: orphanFallback
  });
  const orphanCutover = await orphanStore.assertWhatsAppOnboardingReady();
  assert.strictEqual(orphanCutover.skipped_orphaned_tenants, 1);
  assert.strictEqual(orphanStore.primaryAuthoritative, true);
  assert.strictEqual(await orphanPrimary.get("removed-tenant", "whatsapp"), null,
    "a deleted tenant's append-only state must never be backfilled or compete with its canonical owner");

  const beginRpcCalls = [];
  const supabaseAttemptStore = new SupabaseChannelConnectionStore({
    url: "https://supabase.example",
    headers: { Authorization: "Bearer service-role" },
    axiosClient: {
      get: async function (url, options) {
        assert.strictEqual(url, "https://supabase.example/rest/v1/tenants");
        assert.strictEqual(options.params.select, "id");
        return { data: options.params.id === "eq.tenant-rpc" ? [{ id: "tenant-rpc" }] : [] };
      },
      post: async function (url, body) {
        beginRpcCalls.push({ url, body });
        return { data: [{
          tenant_id: body.p_tenant_id,
          channel: "whatsapp",
          status: "connecting",
          onboarding_attempt_id: body.p_attempt_id,
          onboarding_attempt_status: "awaiting_meta"
        }] };
      }
    }
  });
  assert.strictEqual(await supabaseAttemptStore.tenantExists("tenant-rpc"), true);
  assert.strictEqual(await supabaseAttemptStore.tenantExists("removed-rpc"), false);
  const supabaseBegin = await supabaseAttemptStore.beginWhatsAppAttempt(
    "tenant-rpc",
    "attempt-rpc",
    { allow_protected_reconnect: false },
    { actor: "owner@example.com" }
  );
  assert.strictEqual(supabaseBegin.started, true);
  assert.strictEqual(beginRpcCalls.length, 1);
  assert.strictEqual(beginRpcCalls[0].url, "https://supabase.example/rest/v1/rpc/begin_whatsapp_attempt_v2");
  assert.deepStrictEqual(beginRpcCalls[0].body, {
    p_tenant_id: "tenant-rpc",
    p_attempt_id: "attempt-rpc",
    p_actor: "owner@example.com",
    p_allow_protected_reconnect: false
  });

  const store = new InMemoryChannelConnectionStore();
  let preparations = 0;
  let registrations = 0;
  let subscriptions = 0;
  let verifications = 0;
  const service = createChannelConnectionService({
    store,
    provider: providerFor({
      onPrepare: function (session) {
        preparations++;
        return candidate(session.phone_number_id, session.waba_id);
      },
      onRegister: function (asset) {
        registrations++;
        assert(/^[0-9]{6}$/.test(asset.registration_pin));
        return { ok: true };
      },
      onSubscribe: function () {
        subscriptions++;
        return { ok: true };
      },
      onVerify: function (asset) {
        verifications++;
        return { ok: true, account_label: asset.account_label };
      }
    }),
    encryptionKey,
    now,
    whatsappVerificationChecks: 1,
    whatsappVerificationIntervalMs: 0
  });

  const concurrentBeginStore = new InMemoryChannelConnectionStore();
  const concurrentBeginServiceA = createChannelConnectionService({
    store: concurrentBeginStore,
    provider: providerFor(),
    encryptionKey,
    now
  });
  const concurrentBeginServiceB = createChannelConnectionService({
    store: concurrentBeginStore,
    provider: providerFor(),
    encryptionKey,
    now
  });
  const concurrentBegins = await Promise.allSettled([
    concurrentBeginServiceA.begin(
      "tenant-concurrent-begin",
      "whatsapp",
      "owner@example.com",
      "state-a",
      { attemptId: "attempt-concurrent-a" }
    ),
    concurrentBeginServiceB.begin(
      "tenant-concurrent-begin",
      "whatsapp",
      "owner@example.com",
      "state-b",
      { attemptId: "attempt-concurrent-b" }
    )
  ]);
  assert.strictEqual(concurrentBegins.filter(function (result) {
    return result.status === "fulfilled";
  }).length, 1, "only one application replica may atomically start a WhatsApp attempt");
  const concurrentBeginFailure = concurrentBegins.find(function (result) {
    return result.status === "rejected";
  });
  assert(concurrentBeginFailure.reason instanceof ChannelConnectionError);
  assert.strictEqual(concurrentBeginFailure.reason.code, "whatsapp_onboarding_attempt_active");
  const concurrentBeginRow = await concurrentBeginStore.get("tenant-concurrent-begin", "whatsapp");
  assert(["attempt-concurrent-a", "attempt-concurrent-b"].includes(concurrentBeginRow.onboarding_attempt_id));
  assert.strictEqual(concurrentBeginStore.audit.filter(function (event) {
    return event.action === "whatsapp_onboarding_started";
  }).length, 1, "the losing replica must not append a second start audit event");
  const cancelledThroughGenericDisconnect = await concurrentBeginServiceA.disconnect(
    "tenant-concurrent-begin",
    "whatsapp",
    "super-admin"
  );
  assert.strictEqual(cancelledThroughGenericDisconnect.status, "not_connected",
    "generic disconnect must delegate a pre-registration attempt to the attempt CAS");
  assert.strictEqual(
    (await concurrentBeginStore.get("tenant-concurrent-begin", "whatsapp")).onboarding_attempt_status,
    "cancelled"
  );

  const delayedBeginStore = new InMemoryChannelConnectionStore();
  const delayedBeginEntered = deferred();
  const delayedBeginRelease = deferred();
  const delayedRegisterEntered = deferred();
  const delayedRegisterRelease = deferred();
  const atomicBegin = delayedBeginStore.beginWhatsAppAttempt.bind(delayedBeginStore);
  delayedBeginStore.beginWhatsAppAttempt = async function (tenantId, attemptId, fields, event) {
    if (attemptId === "attempt-delayed") {
      delayedBeginEntered.resolve();
      await delayedBeginRelease.promise;
    }
    return atomicBegin(tenantId, attemptId, fields, event);
  };
  const delayedBeginService = createChannelConnectionService({
    store: delayedBeginStore,
    provider: providerFor(),
    encryptionKey,
    now
  });
  const winningBeginService = createChannelConnectionService({
    store: delayedBeginStore,
    provider: providerFor({
      onRegister: async function () {
        delayedRegisterEntered.resolve();
        await delayedRegisterRelease.promise;
        return { ok: true };
      }
    }),
    encryptionKey,
    now,
    whatsappVerificationChecks: 1,
    whatsappVerificationIntervalMs: 0
  });
  const delayedBegin = delayedBeginService.begin(
    "tenant-delayed-begin",
    "whatsapp",
    "slow@example.com",
    "state-delayed",
    { attemptId: "attempt-delayed" }
  );
  await delayedBeginEntered.promise;
  await winningBeginService.begin(
    "tenant-delayed-begin",
    "whatsapp",
    "winner@example.com",
    "state-winner",
    { attemptId: "attempt-winner" }
  );
  const winningCompletion = winningBeginService.completeEmbeddedWhatsApp({
    tenant_id: "tenant-delayed-begin",
    actor: "winner@example.com",
    attempt_id: "attempt-winner",
    code: "oauth-winner",
    session: { waba_id: "waba-winner", phone_number_id: "phone-winner" }
  });
  await delayedRegisterEntered.promise;
  const beforeDelayedBegin = await delayedBeginStore.get("tenant-delayed-begin", "whatsapp");
  assert.strictEqual(beforeDelayedBegin.onboarding_attempt_id, "attempt-winner");
  assert.strictEqual(beforeDelayedBegin.onboarding_attempt_status, "registering");
  assert.strictEqual(beforeDelayedBegin.onboarding_attempt_phone_number_id, "phone-winner");
  assert.strictEqual(beforeDelayedBegin.onboarding_attempt_waba_id, "waba-winner");
  assert(beforeDelayedBegin.onboarding_attempt_registration_requested_at);
  assert(beforeDelayedBegin.onboarding_attempt_ciphertext);
  assert.strictEqual(delayedBeginStore.whatsappRegistrationLedger.length, 1);
  const delayedBeginRejected = expectCode(delayedBegin, "whatsapp_onboarding_attempt_active");
  delayedBeginRelease.resolve();
  await delayedBeginRejected;
  const afterDelayedBegin = await delayedBeginStore.get("tenant-delayed-begin", "whatsapp");
  assert.strictEqual(afterDelayedBegin.onboarding_attempt_id, "attempt-winner");
  assert.strictEqual(
    afterDelayedBegin.onboarding_attempt_registration_requested_at,
    beforeDelayedBegin.onboarding_attempt_registration_requested_at,
    "a delayed begin must not erase a registration claim"
  );
  assert.strictEqual(
    afterDelayedBegin.onboarding_attempt_ciphertext,
    beforeDelayedBegin.onboarding_attempt_ciphertext,
    "a delayed begin must not erase the persisted candidate"
  );
  assert.strictEqual(delayedBeginStore.whatsappRegistrationLedger.length, 1);
  delayedRegisterRelease.resolve();
  assert.strictEqual((await winningCompletion).connection.status, "connected");

  const disconnectRaceStore = new InMemoryChannelConnectionStore();
  const disconnectRaceEntered = deferred();
  const disconnectRaceRelease = deferred();
  const oldDisconnectCredential = candidate("phone-disconnect-old", "waba-disconnect-old");
  await disconnectRaceStore.upsert({
    tenant_id: "tenant-disconnect-race",
    channel: "whatsapp",
    status: "needs_attention",
    webhook_status: "subscribed",
    account_id: oldDisconnectCredential.account_id,
    account_label: oldDisconnectCredential.account_label,
    phone_number_id: oldDisconnectCredential.phone_number_id,
    whatsapp_business_account_id: oldDisconnectCredential.whatsapp_business_account_id,
    credentials_ciphertext: encryptStoredText(JSON.stringify(oldDisconnectCredential), encryptionKey),
    credential_source: "oauth",
    updated_at: "2026-08-08T22:59:00.000Z"
  });
  const disconnectRaceService = createChannelConnectionService({
    store: disconnectRaceStore,
    provider: providerFor({
      onDisconnect: async function () {
        disconnectRaceEntered.resolve();
        await disconnectRaceRelease.promise;
        return { ok: true };
      }
    }),
    encryptionKey,
    now
  });
  const disconnectInFlight = disconnectRaceService.disconnect(
    "tenant-disconnect-race",
    "whatsapp",
    "super-admin"
  );
  await disconnectRaceEntered.promise;
  await disconnectRaceService.begin(
    "tenant-disconnect-race",
    "whatsapp",
    "owner@example.com",
    "state-new-attempt",
    { attemptId: "attempt-after-disconnect-started" }
  );
  const staleDisconnectRejected = expectCode(disconnectInFlight, "whatsapp_connection_changed");
  disconnectRaceRelease.resolve();
  await staleDisconnectRejected;
  const survivedDisconnect = await disconnectRaceStore.get("tenant-disconnect-race", "whatsapp");
  assert.strictEqual(survivedDisconnect.status, "connecting");
  assert.strictEqual(survivedDisconnect.onboarding_attempt_id, "attempt-after-disconnect-started");
  assert.strictEqual(survivedDisconnect.onboarding_attempt_status, "awaiting_meta");
  assert.strictEqual(survivedDisconnect.phone_number_id, "phone-disconnect-old");
  assert(survivedDisconnect.credentials_ciphertext,
    "a late provider disconnect must not clear credentials or the new attempt");
  assert.strictEqual(disconnectRaceStore.audit.filter(function (event) {
    return event.action === "disconnected";
  }).length, 0, "a stale disconnect must not write a successful durable transition");

  const realDisconnectStore = new InMemoryChannelConnectionStore();
  let realProviderDisconnects = 0;
  const realDisconnectCredential = candidate("phone-real-disconnect", "waba-real-disconnect");
  await realDisconnectStore.upsert({
    tenant_id: "tenant-real-disconnect",
    channel: "whatsapp",
    status: "connected",
    webhook_status: "subscribed",
    account_id: realDisconnectCredential.account_id,
    account_label: realDisconnectCredential.account_label,
    phone_number_id: realDisconnectCredential.phone_number_id,
    whatsapp_business_account_id: realDisconnectCredential.whatsapp_business_account_id,
    credentials_ciphertext: encryptStoredText(JSON.stringify(realDisconnectCredential), encryptionKey),
    credential_source: "oauth",
    updated_at: "2026-08-08T22:58:00.000Z"
  });
  const realDisconnectService = createChannelConnectionService({
    store: realDisconnectStore,
    provider: providerFor({
      onDisconnect: function () {
        realProviderDisconnects++;
        return { ok: true };
      }
    }),
    encryptionKey,
    now
  });
  const realDisconnected = await realDisconnectService.disconnect(
    "tenant-real-disconnect",
    "whatsapp",
    "owner@example.com"
  );
  assert.strictEqual(realProviderDisconnects, 1);
  assert.strictEqual(realDisconnected.status, "disconnected");
  const realDisconnectedRow = await realDisconnectStore.get("tenant-real-disconnect", "whatsapp");
  assert.strictEqual(realDisconnectedRow.credentials_ciphertext, null);
  assert.strictEqual(realDisconnectedRow.phone_number_id, null);
  assert.strictEqual(realDisconnectedRow.whatsapp_business_account_id, null);
  assert.strictEqual(realDisconnectedRow.onboarding_attempt_status, "cancelled");

  const authorizationUrl = await service.begin(
    "tenant-a",
    "whatsapp",
    "owner-a@example.com",
    "signed-state",
    { attemptId: "attempt-a" }
  );
  assert(authorizationUrl.includes("facebook.com"));
  let publicWhatsApp = (await service.listTenant("tenant-a"))
    .find(function (row) { return row.channel === "whatsapp"; });
  assert.strictEqual(publicWhatsApp.status, "connecting");
  assert.strictEqual(publicWhatsApp.onboarding_attempt_active, true);
  assert.strictEqual(publicWhatsApp.cancel_attempt_available, true);
  assert(!JSON.stringify(publicWhatsApp).includes("ciphertext"));

  const first = await service.completeEmbeddedWhatsApp({
    tenant_id: "tenant-a",
    actor: "owner-a@example.com",
    attempt_id: "attempt-a",
    code: "oauth-code-a",
    session: { waba_id: "waba-a", phone_number_id: "phone-a" }
  });
  assert.strictEqual(first.connection.status, "connected");
  assert.strictEqual(first.connection.webhook_status, "subscribed");
  assert.strictEqual(first.connection.disconnect_available, true);
  assert.strictEqual(first.connection.onboarding_attempt_active, false);
  assert.strictEqual(preparations, 1);
  assert.strictEqual(registrations, 1);
  assert.strictEqual(subscriptions, 1);
  assert.strictEqual(verifications, 1);
  assert(!JSON.stringify(first).includes("secret-token"));

  const storedConnected = await store.get("tenant-a", "whatsapp");
  assert.strictEqual(storedConnected.onboarding_attempt_status, "completed");
  assert.strictEqual(storedConnected.onboarding_attempt_ciphertext, null);
  assert.strictEqual(storedConnected.whatsapp_last_registration_phone_number_id, "phone-a");
  assert(storedConnected.whatsapp_last_registration_requested_at);
  assert(storedConnected.credentials_ciphertext.startsWith("enc:v1:"));
  const connectedCredential = JSON.parse(decryptStoredText(storedConnected.credentials_ciphertext, encryptionKey));
  assert.strictEqual(Object.prototype.hasOwnProperty.call(connectedCredential, "registration_pin"), false,
    "the generated registration PIN must not survive in the connected credential");

  const duplicate = await service.completeEmbeddedWhatsApp({
    tenant_id: "tenant-a",
    actor: "owner-a@example.com",
    attempt_id: "attempt-a",
    code: "same-oauth-code-a",
    session: { waba_id: "waba-a", phone_number_id: "phone-a" }
  });
  assert.strictEqual(duplicate.connection.status, "connected");
  assert.strictEqual(preparations, 1, "a duplicate callback must not exchange OAuth again");
  assert.strictEqual(registrations, 1, "a duplicate callback must not repeat /register");
  await service.verify("tenant-a", "whatsapp", "system:verify");
  assert.strictEqual(registrations, 1, "verification must not repeat /register");
  await expectCode(service.begin("tenant-a", "whatsapp", "owner-a@example.com", "new-state", {
    attemptId: "attempt-b"
  }), "active_connection_must_be_disconnected");

  const coexistenceStore = new InMemoryChannelConnectionStore();
  let coexistencePreparations = 0;
  let coexistenceRegistrations = 0;
  let coexistenceSubscriptions = 0;
  let coexistenceVerifications = 0;
  const coexistenceService = createChannelConnectionService({
    store: coexistenceStore,
    provider: providerFor({
      onPrepare: function (session) {
        coexistencePreparations++;
        assert.strictEqual(session.onboarding_mode, "coexistence");
        assert.strictEqual(session.onboarding_event, "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING");
        return coexistenceCandidate(session.phone_number_id, session.waba_id);
      },
      onRegister: function () {
        coexistenceRegistrations++;
        assert.fail("coexistence must never call POST /register");
      },
      onSubscribe: function () {
        coexistenceSubscriptions++;
        return { ok: true };
      },
      onVerify: function (asset) {
        coexistenceVerifications++;
        assert.strictEqual(asset.coexistence, true);
        return { ok: true, account_label: asset.account_label };
      }
    }),
    encryptionKey,
    now,
    whatsappVerificationChecks: 1,
    whatsappVerificationIntervalMs: 0
  });
  await coexistenceService.begin(
    "tenant-coexistence",
    "whatsapp",
    "owner@example.com",
    "signed-coexistence-state",
    { attemptId: "attempt-coexistence", whatsappOnboardingMode: "coexistence" }
  );
  const coexistenceConnected = await coexistenceService.completeEmbeddedWhatsApp({
    tenant_id: "tenant-coexistence",
    actor: "owner@example.com",
    attempt_id: "attempt-coexistence",
    code: "oauth-coexistence",
    session: {
      waba_id: "waba-coexistence",
      phone_number_id: "phone-coexistence",
      onboarding_mode: "coexistence",
      onboarding_event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
      coexistence: true,
      is_wa_login_user: true
    }
  });
  assert.strictEqual(coexistenceConnected.connection.status, "connected");
  assert.strictEqual(coexistenceConnected.connection.whatsapp_onboarding_mode, "coexistence");
  assert.strictEqual(coexistenceConnected.connection.disconnect_available, true);
  assert.strictEqual(coexistencePreparations, 1);
  assert.strictEqual(coexistenceRegistrations, 0);
  assert.strictEqual(coexistenceSubscriptions, 1);
  assert.strictEqual(coexistenceVerifications, 1);
  assert.strictEqual(coexistenceStore.whatsappRegistrationLedger.length, 0,
    "Meta-managed coexistence must not consume Nextfor's /register ledger");
  const storedCoexistence = await coexistenceStore.get("tenant-coexistence", "whatsapp");
  assert.strictEqual(storedCoexistence.coexistence_confirmed, true);
  assert.strictEqual(storedCoexistence.whatsapp_last_registration_phone_number_id, null);
  const coexistenceCredential = JSON.parse(decryptStoredText(storedCoexistence.credentials_ciphertext, encryptionKey));
  assert.strictEqual(coexistenceCredential.onboarding_mode, "coexistence");
  assert.strictEqual(coexistenceCredential.coexistence, true);
  assert.strictEqual(coexistenceCredential.coexistence_event_confirmed, true);
  const duplicateCoexistence = await coexistenceService.completeEmbeddedWhatsApp({
    tenant_id: "tenant-coexistence",
    actor: "owner@example.com",
    attempt_id: "attempt-coexistence",
    code: "duplicate-oauth-coexistence",
    session: {
      waba_id: "waba-coexistence",
      phone_number_id: "phone-coexistence",
      onboarding_mode: "coexistence",
      onboarding_event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"
    }
  });
  assert.strictEqual(duplicateCoexistence.connection.status, "connected");
  assert.strictEqual(coexistencePreparations, 1, "duplicate coexistence callback must not exchange OAuth again");
  assert.strictEqual(coexistenceRegistrations, 0);

  const recoveryStore = new InMemoryChannelConnectionStore();
  let recoveryRegistrations = 0;
  const recoveryService = createChannelConnectionService({
    store: recoveryStore,
    provider: providerFor({
      onPrepare: function (session) {
        assert.strictEqual(session.onboarding_mode, "coexistence_recovery");
        assert.strictEqual(session.onboarding_event, "FINISH_GRANT_ONLY_API_ACCESS");
        return Object.assign(coexistenceCandidate(session.phone_number_id, session.waba_id), {
          onboarding_mode: "coexistence_recovery"
        });
      },
      onRegister: function () {
        recoveryRegistrations++;
        assert.fail("app-only recovery must never call POST /register");
      },
      onSubscribe: function () { return { ok: true }; },
      onVerify: function (asset) {
        assert.strictEqual(asset.coexistence, true);
        return { ok: true, account_label: asset.account_label };
      }
    }),
    encryptionKey,
    now,
    whatsappVerificationChecks: 1,
    whatsappVerificationIntervalMs: 0
  });
  await recoveryService.begin(
    "tenant-recovery",
    "whatsapp",
    "owner@example.com",
    "signed-recovery-state",
    { attemptId: "attempt-recovery", whatsappOnboardingMode: "coexistence_recovery" }
  );
  const recoveryConnected = await recoveryService.completeEmbeddedWhatsApp({
    tenant_id: "tenant-recovery",
    actor: "owner@example.com",
    attempt_id: "attempt-recovery",
    code: "oauth-recovery",
    session: {
      waba_id: "waba-recovery",
      phone_number_id: "phone-recovery",
      onboarding_mode: "coexistence_recovery",
      onboarding_event: "FINISH_GRANT_ONLY_API_ACCESS",
      app_only_install: true
    }
  });
  assert.strictEqual(recoveryConnected.connection.status, "connected");
  assert.strictEqual(recoveryConnected.connection.whatsapp_onboarding_mode, "coexistence");
  assert.strictEqual(recoveryRegistrations, 0);
  assert.strictEqual(recoveryStore.whatsappRegistrationLedger.length, 0);
  const storedRecovery = await recoveryStore.get("tenant-recovery", "whatsapp");
  assert.strictEqual(storedRecovery.coexistence_confirmed, true);
  assert.strictEqual(storedRecovery.whatsapp_last_registration_phone_number_id, null);

  const pendingCoexistenceStore = new InMemoryChannelConnectionStore();
  let pendingCoexistenceDisconnects = 0;
  const pendingCoexistenceService = createChannelConnectionService({
    store: pendingCoexistenceStore,
    provider: providerFor({
      onPrepare: function (session) { return coexistenceCandidate(session.phone_number_id, session.waba_id); },
      onRegister: function () { assert.fail("pending coexistence must never call /register"); },
      onVerify: function () {
        return { ok: false, pending: true, error: "Meta is still completing WhatsApp Business App onboarding" };
      },
      onDisconnect: function () {
        pendingCoexistenceDisconnects++;
        return { ok: true };
      }
    }),
    encryptionKey,
    now,
    whatsappVerificationChecks: 1,
    whatsappVerificationIntervalMs: 0
  });
  await pendingCoexistenceService.begin("tenant-pending-coexistence", "whatsapp", "owner@example.com", "state", {
    attemptId: "attempt-pending-coexistence",
    whatsappOnboardingMode: "coexistence"
  });
  const pendingCoexistence = await pendingCoexistenceService.completeEmbeddedWhatsApp({
    tenant_id: "tenant-pending-coexistence",
    actor: "owner@example.com",
    attempt_id: "attempt-pending-coexistence",
    code: "oauth-pending-coexistence",
    session: {
      waba_id: "waba-pending-coexistence",
      phone_number_id: "phone-pending-coexistence",
      onboarding_mode: "coexistence",
      onboarding_event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"
    }
  });
  assert.strictEqual(pendingCoexistence.connection.status, "connecting");
  assert.strictEqual(pendingCoexistence.connection.cancel_attempt_available, true);
  assert.strictEqual(pendingCoexistence.connection.whatsapp_onboarding_mode, "coexistence");
  const cancelledPendingCoexistence = await pendingCoexistenceService.discardWhatsAppAttempt(
    "tenant-pending-coexistence",
    "owner@example.com"
  );
  assert.strictEqual(cancelledPendingCoexistence.status, "not_connected");
  assert.strictEqual(pendingCoexistenceDisconnects, 1,
    "cancelling a pending coexistence attempt must first remove Nextfor's WABA subscription");
  assert.strictEqual(pendingCoexistenceStore.whatsappRegistrationLedger.length, 0);

  const modeMismatchStore = new InMemoryChannelConnectionStore();
  const modeMismatchService = createChannelConnectionService({
    store: modeMismatchStore,
    provider: providerFor({
      onPrepare: function (session) {
        return coexistenceCandidate(session.phone_number_id, session.waba_id);
      },
      onRegister: function () { assert.fail("a mode mismatch must fail before /register"); }
    }),
    encryptionKey,
    now,
    whatsappVerificationChecks: 1,
    whatsappVerificationIntervalMs: 0
  });
  await modeMismatchService.begin("tenant-mode-mismatch", "whatsapp", "owner@example.com", "state", {
    attemptId: "attempt-mode-mismatch",
    whatsappOnboardingMode: "cloud_api"
  });
  await expectCode(modeMismatchService.completeEmbeddedWhatsApp({
    tenant_id: "tenant-mode-mismatch",
    actor: "owner@example.com",
    attempt_id: "attempt-mode-mismatch",
    code: "oauth-mode-mismatch",
    session: {
      waba_id: "waba-mode-mismatch",
      phone_number_id: "phone-mode-mismatch",
      onboarding_mode: "cloud_api",
      onboarding_event: "FINISH"
    }
  }), "whatsapp_onboarding_mode_mismatch");

  const restartStore = new InMemoryChannelConnectionStore();
  let restartRegistrations = 0;
  const firstProcess = createChannelConnectionService({
    store: restartStore,
    provider: providerFor({
      onRegister: function () { restartRegistrations++; return { ok: true }; },
      onVerify: function () {
        return { ok: false, pending: true, error: "WhatsApp number is not CONNECTED in Cloud API" };
      }
    }),
    encryptionKey,
    now,
    whatsappVerificationChecks: 1,
    whatsappVerificationIntervalMs: 0
  });
  await firstProcess.begin("tenant-restart", "whatsapp", "owner@example.com", "state", {
    attemptId: "attempt-restart"
  });
  const pending = await firstProcess.completeEmbeddedWhatsApp({
    tenant_id: "tenant-restart",
    actor: "owner@example.com",
    attempt_id: "attempt-restart",
    code: "oauth-code",
    session: { waba_id: "waba-restart", phone_number_id: "phone-restart" }
  });
  assert.strictEqual(pending.connection.status, "connecting");
  assert.strictEqual(restartRegistrations, 1);
  const pendingStored = await restartStore.get("tenant-restart", "whatsapp");
  assert(pendingStored.onboarding_attempt_registration_requested_at);
  assert(pendingStored.onboarding_attempt_registration_accepted_at);

  const secondProcess = createChannelConnectionService({
    store: restartStore,
    provider: providerFor({
      onPrepare: function () { assert.fail("restart must use the durable encrypted attempt"); },
      onRegister: function () { assert.fail("restart must not repeat /register"); },
      onVerify: function (asset) { return { ok: true, account_label: asset.account_label }; }
    }),
    encryptionKey,
    now,
    whatsappVerificationChecks: 1,
    whatsappVerificationIntervalMs: 0
  });
  const afterRestart = await secondProcess.verify("tenant-restart", "whatsapp", "system:restart");
  assert.strictEqual(afterRestart.status, "connected");
  assert.strictEqual(restartRegistrations, 1);

  const limitedStore = new InMemoryChannelConnectionStore();
  let limitedRegistrations = 0;
  const limitedProvider = providerFor({
    onRegister: function (asset) {
      limitedRegistrations++;
      if (asset.phone_number_id !== "phone-limited") return { ok: true };
      const error = new ChannelConnectionError(
        "asset_activation_failed",
        422,
        "Registration failed because there were too many attempts"
      );
      error.activationStage = "register";
      error.meta = {
        meta_code: 133016,
        meta_message: "Registration failed because there were too many attempts"
      };
      throw error;
    },
    onVerify: function (asset) {
      return asset.phone_number_id === "phone-limited"
        ? { ok: false, pending: true, error: "WhatsApp number is not CONNECTED in Cloud API" }
        : { ok: true, account_label: asset.account_label };
    }
  });
  const limitedService = createChannelConnectionService({
    store: limitedStore,
    provider: limitedProvider,
    encryptionKey,
    now,
    whatsappVerificationChecks: 1,
    whatsappVerificationIntervalMs: 0
  });
  await limitedService.begin("tenant-limited", "whatsapp", "owner@example.com", "state", {
    attemptId: "attempt-limited"
  });
  await expectCode(limitedService.completeEmbeddedWhatsApp({
    tenant_id: "tenant-limited",
    actor: "owner@example.com",
    attempt_id: "attempt-limited",
    code: "oauth-code",
    session: { waba_id: "waba-limited", phone_number_id: "phone-limited" }
  }), "whatsapp_activation_rate_limited");
  assert.strictEqual(limitedRegistrations, 1);
  const limitedCheck = await limitedService.verify("tenant-limited", "whatsapp", "system:verify");
  assert.strictEqual(limitedCheck.status, "needs_attention");
  assert.strictEqual(limitedCheck.onboarding_attempt_stage, "registration_rejected");
  assert.strictEqual(limitedCheck.cancel_attempt_available, true);
  assert.strictEqual(limitedRegistrations, 1, "a failed registration must never be repeated by verify");
  await limitedService.discardWhatsAppAttempt("tenant-limited", "owner@example.com");
  await limitedService.begin("tenant-limited", "whatsapp", "owner@example.com", "state-2", {
    attemptId: "attempt-limited-2"
  });
  const differentPhone = await limitedService.completeEmbeddedWhatsApp({
    tenant_id: "tenant-limited",
    actor: "owner@example.com",
    attempt_id: "attempt-limited-2",
    code: "oauth-code-2",
    session: { waba_id: "waba-different", phone_number_id: "phone-different" }
  });
  assert.strictEqual(differentPhone.connection.status, "connected");
  assert.strictEqual(limitedRegistrations, 2, "a rejected phone must not block a different phone");
  await limitedService.begin("tenant-ledger-guard", "whatsapp", "other@example.com", "state-3", {
    attemptId: "attempt-ledger-guard"
  });
  await expectCode(limitedService.completeEmbeddedWhatsApp({
    tenant_id: "tenant-ledger-guard",
    actor: "other@example.com",
    attempt_id: "attempt-ledger-guard",
    code: "oauth-code-3",
    session: { waba_id: "waba-limited", phone_number_id: "phone-limited" }
  }), "whatsapp_activation_rate_limited");
  assert.strictEqual(limitedRegistrations, 2,
    "the immutable ledger must block the rejected phone across tenants for 72 hours");

  const ownershipStore = new InMemoryChannelConnectionStore();
  let ownershipRegistrations = 0;
  const ownershipService = createChannelConnectionService({
    store: ownershipStore,
    provider: providerFor({
      onRegister: function () { ownershipRegistrations++; return { ok: true }; }
    }),
    encryptionKey,
    now,
    whatsappVerificationChecks: 1,
    whatsappVerificationIntervalMs: 0
  });
  await ownershipService.begin("tenant-owner", "whatsapp", "owner@example.com", "state", {
    attemptId: "attempt-owner"
  });
  await ownershipService.completeEmbeddedWhatsApp({
    tenant_id: "tenant-owner",
    actor: "owner@example.com",
    attempt_id: "attempt-owner",
    code: "oauth-owner",
    session: { waba_id: "shared-waba", phone_number_id: "phone-owner" }
  });
  await ownershipService.begin("tenant-other", "whatsapp", "other@example.com", "state", {
    attemptId: "attempt-other"
  });
  await expectCode(ownershipService.completeEmbeddedWhatsApp({
    tenant_id: "tenant-other",
    actor: "other@example.com",
    attempt_id: "attempt-other",
    code: "oauth-other",
    session: { waba_id: "shared-waba", phone_number_id: "phone-other" }
  }), "channel_asset_already_assigned");
  assert.strictEqual(ownershipRegistrations, 1, "WABA ownership must be checked before /register");

  const sharedAttemptStore = new InMemoryChannelConnectionStore();
  const sharedAttemptPrepareGate = deferred();
  const sharedAttemptBothPrepared = deferred();
  let sharedAttemptPreparations = 0;
  let sharedAttemptRegistrations = 0;
  function sharedAttemptProvider() {
    return providerFor({
      onPrepare: async function (session) {
        sharedAttemptPreparations++;
        if (sharedAttemptPreparations === 2) sharedAttemptBothPrepared.resolve();
        await sharedAttemptPrepareGate.promise;
        return candidate(session.phone_number_id, session.waba_id);
      },
      onRegister: function () {
        sharedAttemptRegistrations++;
        return { ok: true };
      }
    });
  }
  const sharedAttemptServiceA = createChannelConnectionService({
    store: sharedAttemptStore,
    provider: sharedAttemptProvider(),
    encryptionKey,
    now,
    whatsappVerificationChecks: 1,
    whatsappVerificationIntervalMs: 0
  });
  const sharedAttemptServiceB = createChannelConnectionService({
    store: sharedAttemptStore,
    provider: sharedAttemptProvider(),
    encryptionKey,
    now,
    whatsappVerificationChecks: 1,
    whatsappVerificationIntervalMs: 0
  });
  await sharedAttemptServiceA.begin("tenant-shared-attempt", "whatsapp", "owner@example.com", "state", {
    attemptId: "attempt-shared"
  });
  const sharedAttemptCompletionA = sharedAttemptServiceA.completeEmbeddedWhatsApp({
    tenant_id: "tenant-shared-attempt",
    actor: "owner@example.com",
    attempt_id: "attempt-shared",
    code: "oauth-a",
    session: { waba_id: "waba-shared-attempt", phone_number_id: "phone-shared-attempt" }
  });
  const sharedAttemptCompletionB = sharedAttemptServiceB.completeEmbeddedWhatsApp({
    tenant_id: "tenant-shared-attempt",
    actor: "owner@example.com",
    attempt_id: "attempt-shared",
    code: "oauth-b",
    session: { waba_id: "waba-shared-attempt", phone_number_id: "phone-shared-attempt" }
  });
  await sharedAttemptBothPrepared.promise;
  sharedAttemptPrepareGate.resolve();
  const sharedAttemptResults = await Promise.all([
    sharedAttemptCompletionA,
    sharedAttemptCompletionB
  ]);
  assert.strictEqual(sharedAttemptRegistrations, 1,
    "two processes completing the same attempt must call /register exactly once");
  assert(sharedAttemptResults.some(function (result) {
    return result.connection.status === "connected";
  }));
  const sharedAttemptFinal = await sharedAttemptStore.get("tenant-shared-attempt", "whatsapp");
  assert.strictEqual(sharedAttemptFinal.status, "connected");
  assert.strictEqual(sharedAttemptFinal.onboarding_attempt_status, "completed");

  const consumedCodeStore = new InMemoryChannelConnectionStore();
  const consumedCodeRegisterEntered = deferred();
  const consumedCodeRegisterRelease = deferred();
  let consumedCodeRegistrations = 0;
  const consumedCodeServiceA = createChannelConnectionService({
    store: consumedCodeStore,
    provider: providerFor({
      onRegister: async function () {
        consumedCodeRegistrations++;
        consumedCodeRegisterEntered.resolve();
        await consumedCodeRegisterRelease.promise;
        throw new Error("network reset after Meta accepted registration");
      }
    }),
    encryptionKey,
    now,
    whatsappVerificationChecks: 1,
    whatsappVerificationIntervalMs: 0
  });
  const consumedCodeServiceB = createChannelConnectionService({
    store: consumedCodeStore,
    provider: providerFor({
      onPrepare: async function () {
        await consumedCodeRegisterEntered.promise;
        throw new ChannelConnectionError("invalid_authorization", 422, "OAuth code already consumed");
      }
    }),
    encryptionKey,
    now,
    whatsappVerificationChecks: 1,
    whatsappVerificationIntervalMs: 0
  });
  await consumedCodeServiceA.begin("tenant-consumed-code", "whatsapp", "owner@example.com", "state", {
    attemptId: "attempt-consumed-code"
  });
  const consumedCodeCompletionA = consumedCodeServiceA.completeEmbeddedWhatsApp({
    tenant_id: "tenant-consumed-code",
    actor: "owner@example.com",
    attempt_id: "attempt-consumed-code",
    code: "one-shot-code",
    session: { waba_id: "waba-consumed-code", phone_number_id: "phone-consumed-code" }
  });
  const consumedCodeCompletionB = consumedCodeServiceB.completeEmbeddedWhatsApp({
    tenant_id: "tenant-consumed-code",
    actor: "owner@example.com",
    attempt_id: "attempt-consumed-code",
    code: "one-shot-code",
    session: { waba_id: "waba-consumed-code", phone_number_id: "phone-consumed-code" }
  });
  await consumedCodeRegisterEntered.promise;
  await expectCode(consumedCodeCompletionB, "invalid_authorization");
  const whileRegistering = await consumedCodeStore.get("tenant-consumed-code", "whatsapp");
  assert.strictEqual(whileRegistering.onboarding_attempt_status, "registering",
    "a callback that does not own the registration claim must not mark it failed");
  consumedCodeRegisterRelease.resolve();
  await expectCode(consumedCodeCompletionA, "asset_activation_failed");
  const unknownOutcome = await consumedCodeStore.get("tenant-consumed-code", "whatsapp");
  assert.strictEqual(unknownOutcome.onboarding_attempt_status, "registration_outcome_unknown");
  const consumedCodeRecovery = createChannelConnectionService({
    store: consumedCodeStore,
    provider: providerFor({
      onPrepare: function () { assert.fail("recovery must use the encrypted attempt"); },
      onRegister: function () { assert.fail("recovery must never repeat /register"); },
      onVerify: function (asset) { return { ok: true, account_label: asset.account_label }; }
    }),
    encryptionKey,
    now,
    whatsappVerificationChecks: 1,
    whatsappVerificationIntervalMs: 0
  });
  const recoveredConsumedCode = await consumedCodeRecovery.verify(
    "tenant-consumed-code",
    "whatsapp",
    "system:reconcile"
  );
  assert.strictEqual(recoveredConsumedCode.status, "connected");
  assert.strictEqual(consumedCodeRegistrations, 1);

  const sharedAssetStore = new InMemoryChannelConnectionStore();
  const sharedAssetPrepareGate = deferred();
  const sharedAssetBothPrepared = deferred();
  let sharedAssetPreparations = 0;
  let sharedAssetRegistrations = 0;
  function sharedAssetProvider() {
    return providerFor({
      onPrepare: async function (session) {
        sharedAssetPreparations++;
        if (sharedAssetPreparations === 2) sharedAssetBothPrepared.resolve();
        await sharedAssetPrepareGate.promise;
        return candidate(session.phone_number_id, session.waba_id);
      },
      onRegister: function () {
        sharedAssetRegistrations++;
        return { ok: true };
      }
    });
  }
  const sharedAssetServiceA = createChannelConnectionService({
    store: sharedAssetStore,
    provider: sharedAssetProvider(),
    encryptionKey,
    now,
    whatsappVerificationChecks: 1,
    whatsappVerificationIntervalMs: 0
  });
  const sharedAssetServiceB = createChannelConnectionService({
    store: sharedAssetStore,
    provider: sharedAssetProvider(),
    encryptionKey,
    now,
    whatsappVerificationChecks: 1,
    whatsappVerificationIntervalMs: 0
  });
  await sharedAssetServiceA.begin("tenant-shared-asset-a", "whatsapp", "a@example.com", "state-a", {
    attemptId: "attempt-shared-asset-a"
  });
  await sharedAssetServiceB.begin("tenant-shared-asset-b", "whatsapp", "b@example.com", "state-b", {
    attemptId: "attempt-shared-asset-b"
  });
  const sharedAssetCompletionA = sharedAssetServiceA.completeEmbeddedWhatsApp({
    tenant_id: "tenant-shared-asset-a",
    actor: "a@example.com",
    attempt_id: "attempt-shared-asset-a",
    code: "oauth-a",
    session: { waba_id: "waba-shared-asset", phone_number_id: "phone-shared-asset" }
  });
  const sharedAssetCompletionB = sharedAssetServiceB.completeEmbeddedWhatsApp({
    tenant_id: "tenant-shared-asset-b",
    actor: "b@example.com",
    attempt_id: "attempt-shared-asset-b",
    code: "oauth-b",
    session: { waba_id: "waba-shared-asset", phone_number_id: "phone-shared-asset" }
  });
  await sharedAssetBothPrepared.promise;
  sharedAssetPrepareGate.resolve();
  const sharedAssetResults = await Promise.allSettled([
    sharedAssetCompletionA,
    sharedAssetCompletionB
  ]);
  const sharedAssetRejected = sharedAssetResults.filter(function (result) {
    return result.status === "rejected";
  });
  assert.strictEqual(sharedAssetRejected.length, 1,
    "exactly one tenant must lose a simultaneous claim for the same WhatsApp asset");
  assert(sharedAssetRejected[0].reason instanceof ChannelConnectionError);
  assert.strictEqual(sharedAssetRejected[0].reason.code, "channel_asset_already_assigned");
  assert.strictEqual(sharedAssetRegistrations, 1,
    "asset ownership must be resolved before the losing tenant can call /register");

  const inFlightStore = new InMemoryChannelConnectionStore();
  const registrationEntered = deferred();
  const registrationRelease = deferred();
  let inFlightRegistrations = 0;
  const inFlightService = createChannelConnectionService({
    store: inFlightStore,
    provider: providerFor({
      onRegister: async function () {
        inFlightRegistrations++;
        registrationEntered.resolve();
        await registrationRelease.promise;
        return { ok: true };
      }
    }),
    encryptionKey,
    now,
    whatsappVerificationChecks: 1,
    whatsappVerificationIntervalMs: 0
  });
  await inFlightService.begin("tenant-register-in-flight", "whatsapp", "owner@example.com", "state", {
    attemptId: "attempt-register-in-flight"
  });
  const inFlightCompletion = inFlightService.completeEmbeddedWhatsApp({
    tenant_id: "tenant-register-in-flight",
    actor: "owner@example.com",
    attempt_id: "attempt-register-in-flight",
    code: "oauth-code",
    session: { waba_id: "waba-register-in-flight", phone_number_id: "phone-register-in-flight" }
  });
  await registrationEntered.promise;
  await expectCode(
    inFlightService.discardWhatsAppAttempt("tenant-register-in-flight", "owner@example.com"),
    "whatsapp_onboarding_cannot_cancel"
  );
  const authoritativeInFlightGet = inFlightStore.get.bind(inFlightStore);
  let staleDisconnectReads = 2;
  inFlightStore.get = async function (tenantId, channel) {
    const current = await authoritativeInFlightGet(tenantId, channel);
    if (tenantId === "tenant-register-in-flight" && channel === "whatsapp" && staleDisconnectReads > 0) {
      staleDisconnectReads--;
      return Object.assign({}, current, { onboarding_attempt_registration_requested_at: null });
    }
    return current;
  };
  await expectCode(
    inFlightService.disconnect("tenant-register-in-flight", "whatsapp", "super-admin"),
    "whatsapp_onboarding_cannot_cancel"
  );
  inFlightStore.get = authoritativeInFlightGet;
  await expectCode(inFlightService.begin(
    "tenant-register-in-flight",
    "whatsapp",
    "owner@example.com",
    "state-new",
    { attemptId: "attempt-register-in-flight-new" }
  ), "whatsapp_onboarding_attempt_active");
  const inFlightDuringRegistration = await inFlightStore.get("tenant-register-in-flight", "whatsapp");
  assert.strictEqual(inFlightDuringRegistration.onboarding_attempt_id, "attempt-register-in-flight");
  assert(inFlightDuringRegistration.onboarding_attempt_registration_requested_at);
  assert(inFlightDuringRegistration.onboarding_attempt_ciphertext,
    "a stale or super-admin disconnect must not erase the claimed candidate");
  assert.strictEqual(inFlightDuringRegistration.onboarding_attempt_phone_number_id, "phone-register-in-flight");
  assert.strictEqual(inFlightDuringRegistration.onboarding_attempt_waba_id, "waba-register-in-flight");
  registrationRelease.resolve();
  const inFlightFinished = await inFlightCompletion;
  assert.strictEqual(inFlightFinished.connection.status, "connected");
  assert.strictEqual(inFlightRegistrations, 1);

  const staleCallbackStore = new InMemoryChannelConnectionStore();
  const stalePrepareEntered = deferred();
  const stalePrepareRelease = deferred();
  let staleRegistrations = 0;
  const staleCallbackService = createChannelConnectionService({
    store: staleCallbackStore,
    provider: providerFor({
      onPrepare: async function (session) {
        stalePrepareEntered.resolve();
        await stalePrepareRelease.promise;
        return candidate(session.phone_number_id, session.waba_id);
      },
      onRegister: function () {
        staleRegistrations++;
        return { ok: true };
      }
    }),
    encryptionKey,
    now,
    whatsappVerificationChecks: 1,
    whatsappVerificationIntervalMs: 0
  });
  await staleCallbackService.begin("tenant-stale-callback", "whatsapp", "owner@example.com", "old-state", {
    attemptId: "attempt-old"
  });
  const staleCompletion = staleCallbackService.completeEmbeddedWhatsApp({
    tenant_id: "tenant-stale-callback",
    actor: "owner@example.com",
    attempt_id: "attempt-old",
    code: "oauth-old",
    session: { waba_id: "waba-old", phone_number_id: "phone-old" }
  });
  await stalePrepareEntered.promise;
  const cancelledOld = await staleCallbackService.discardWhatsAppAttempt(
    "tenant-stale-callback",
    "owner@example.com"
  );
  assert.strictEqual(cancelledOld.status, "not_connected");
  await staleCallbackService.begin("tenant-stale-callback", "whatsapp", "owner@example.com", "new-state", {
    attemptId: "attempt-new"
  });
  stalePrepareRelease.resolve();
  await expectCode(staleCompletion, "connection_selection_expired");
  const afterStaleCallback = await staleCallbackStore.get("tenant-stale-callback", "whatsapp");
  assert.strictEqual(afterStaleCallback.onboarding_attempt_id, "attempt-new");
  assert.strictEqual(afterStaleCallback.onboarding_attempt_status, "awaiting_meta");
  assert.strictEqual(afterStaleCallback.onboarding_attempt_ciphertext, null);
  assert.strictEqual(staleRegistrations, 0,
    "a stale callback must not register or alter the replacement attempt");

  const verificationRaceStore = new InMemoryChannelConnectionStore();
  const seedVerificationService = createChannelConnectionService({
    store: verificationRaceStore,
    provider: providerFor({
      onVerify: function () {
        return { ok: false, pending: true, error: "WhatsApp number is not CONNECTED in Cloud API" };
      }
    }),
    encryptionKey,
    now,
    whatsappVerificationChecks: 1,
    whatsappVerificationIntervalMs: 0
  });
  await seedVerificationService.begin("tenant-verification-race", "whatsapp", "owner@example.com", "state", {
    attemptId: "attempt-verification-race"
  });
  const seededPending = await seedVerificationService.completeEmbeddedWhatsApp({
    tenant_id: "tenant-verification-race",
    actor: "owner@example.com",
    attempt_id: "attempt-verification-race",
    code: "oauth-code",
    session: { waba_id: "waba-verification-race", phone_number_id: "phone-verification-race" }
  });
  assert.strictEqual(seededPending.connection.status, "connecting");

  const pendingVerificationEntered = deferred();
  const pendingVerificationRelease = deferred();
  const pendingVerificationService = createChannelConnectionService({
    store: verificationRaceStore,
    provider: providerFor({
      onRegister: function () { assert.fail("verification must not repeat /register"); },
      onVerify: async function () {
        pendingVerificationEntered.resolve();
        await pendingVerificationRelease.promise;
        return { ok: false, pending: true, error: "WhatsApp number is not CONNECTED in Cloud API" };
      }
    }),
    encryptionKey,
    now,
    whatsappVerificationChecks: 1,
    whatsappVerificationIntervalMs: 0
  });
  const connectedVerificationService = createChannelConnectionService({
    store: verificationRaceStore,
    provider: providerFor({
      onRegister: function () { assert.fail("verification must not repeat /register"); },
      onVerify: function (asset) {
        return { ok: true, account_label: asset.account_label };
      }
    }),
    encryptionKey,
    now,
    whatsappVerificationChecks: 1,
    whatsappVerificationIntervalMs: 0
  });
  const pendingVerification = pendingVerificationService.verify(
    "tenant-verification-race",
    "whatsapp",
    "system:pending"
  );
  await pendingVerificationEntered.promise;
  const connectedVerification = await connectedVerificationService.verify(
    "tenant-verification-race",
    "whatsapp",
    "system:connected"
  );
  assert.strictEqual(connectedVerification.status, "connected");
  pendingVerificationRelease.resolve();
  const pendingVerificationResult = await pendingVerification;
  assert.strictEqual(pendingVerificationResult.status, "connected",
    "a stale pending verification must observe, not overwrite, the connected state");
  const verificationRaceFinal = await verificationRaceStore.get("tenant-verification-race", "whatsapp");
  assert.strictEqual(verificationRaceFinal.status, "connected");
  assert.strictEqual(verificationRaceFinal.onboarding_attempt_status, "completed");
  assert(verificationRaceFinal.credentials_ciphertext);

  console.log("whatsapp-onboarding-v2.test.js: ok");
})().catch(function (error) {
  console.error(error.stack || error.message);
  process.exit(1);
});
