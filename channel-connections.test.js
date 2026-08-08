"use strict";

const assert = require("assert");
const crypto = require("crypto");
const {
  AppendOnlyChannelConnectionStore,
  ChannelConnectionError,
  InMemoryChannelConnectionStore,
  MetaChannelProvider,
  createChannelConnectionService,
  createLegacyConnections,
  createOAuthState,
  readOAuthState
} = require("./channel-connections");

function expectCode(promise, code) {
  return promise.then(function () {
    assert.fail("Expected " + code);
  }, function (error) {
    assert(error instanceof ChannelConnectionError);
    assert.strictEqual(error.code, code);
  });
}

(async function run() {
  const stateSecret = "channel-state-secret-value-that-is-long-enough";
  const state = createOAuthState(stateSecret, {
    tenant_id: "tenant-a",
    channel: "instagram",
    actor_id: "user-a",
    actor: "admin@a.example",
    return_path: "/admin/super-admin?view=setupReview&tenant_id=tenant-a"
  }, 1000);
  assert.strictEqual(readOAuthState(stateSecret, state, 2000).tenant_id, "tenant-a");
  assert.strictEqual(readOAuthState(stateSecret, state, 2000).channel, "instagram");
  assert.strictEqual(readOAuthState(stateSecret, state, 2000).return_path, "/admin/super-admin?view=setupReview&tenant_id=tenant-a");
  assert.strictEqual(readOAuthState(stateSecret, state, 2000).return_mode, "");
  const popupState = createOAuthState(stateSecret, {
    tenant_id: "tenant-a",
    channel: "instagram",
    actor_id: "user-a",
    actor: "admin@a.example",
    return_path: "/admin/panel?tab=channels",
    return_mode: "popup"
  }, 1000);
  assert.strictEqual(readOAuthState(stateSecret, popupState, 2000).return_mode, "popup");
  assert.strictEqual(readOAuthState(stateSecret, state.slice(0, -1) + "x", 2000), null);
  assert.strictEqual(readOAuthState(stateSecret, state, 11 * 60 * 1000), null);

  const meta = new MetaChannelProvider({
    appId: "123456789",
    appSecret: "meta-app-secret",
    whatsappConfigId: "wa-config-123",
    graphVersion: "v23.0",
    redirectUri: "https://staging.nextforia.com/admin/channel-connections/meta/callback",
    axiosClient: function () {}
  });
  const waUrl = new URL(meta.authorizationUrl("whatsapp", state));
  assert.strictEqual(waUrl.hostname, "www.facebook.com");
  assert.strictEqual(waUrl.searchParams.get("config_id"), "wa-config-123");
  assert(waUrl.searchParams.get("scope").includes("whatsapp_business_management"));
  assert(!waUrl.toString().includes("meta-app-secret"));
  const instagramUrl = new URL(meta.authorizationUrl("instagram", state));
  assert(instagramUrl.searchParams.get("scope").includes("instagram_manage_messages"));
  assert(instagramUrl.searchParams.get("scope").includes("business_management"));

  const embeddedExchangeRequests = [];
  const embeddedExchangeAxios = async function (request) {
    embeddedExchangeRequests.push(request);
    if (request.url.endsWith("/v25.0/waba-embedded/phone_numbers")) {
      return { data: { data: [{
        id: "phone-embedded",
        display_phone_number: "+57 310 6534553",
        verified_name: "NextforIA"
      }] } };
    }
    throw new Error("Unexpected WhatsApp Embedded Signup request: " + request.url);
  };
  embeddedExchangeAxios.get = async function (url, options) {
    embeddedExchangeRequests.push({ method: "GET", url, options });
    assert(url.endsWith("/v25.0/oauth/access_token"));
    assert.strictEqual(options.params.client_id, "123456789");
    assert.strictEqual(options.params.code, "embedded-code");
    assert.strictEqual(Object.prototype.hasOwnProperty.call(options.params, "redirect_uri"), false);
    return { data: { access_token: "embedded-access-token" } };
  };
  const embeddedExchangeMeta = new MetaChannelProvider({
    appId: "123456789",
    appSecret: "meta-app-secret",
    graphVersion: "v25.0",
    redirectUri: "https://nextforia.com/admin/channel-connections/meta/callback",
    axiosClient: embeddedExchangeAxios
  });
  const embeddedCandidate = await embeddedExchangeMeta.prepareEmbeddedWhatsApp("embedded-code", {
    waba_id: "waba-embedded",
    phone_number_id: "phone-embedded",
    business_id: "business-embedded"
  }, {
    redirectUri: "https://nextforia.com/admin/channel-connections/meta/callback"
  });
  assert.strictEqual(embeddedCandidate.phone_number_id, "phone-embedded");
  assert.strictEqual(embeddedCandidate.access_token, "embedded-access-token");
  assert(embeddedExchangeRequests.some(function (request) {
    return request.method === "GET" && request.url.endsWith("/oauth/access_token");
  }));

  const directInstagramRequests = [];
  const directInstagramAxios = async function (request) {
    directInstagramRequests.push(request);
    if (request.url.endsWith("/v25.0/ig-direct/subscribed_apps") && request.method === "POST") {
      return { data: { success: true } };
    }
    if (request.url.endsWith("/v25.0/ig-direct/subscribed_apps")) {
      // Meta may return an internal platform-app id for a direct Instagram
      // Login subscription. Its app-scoped token and exact field set are the
      // authoritative installation proof in that response shape.
      return { data: { data: [{
        id: "internal-instagram-platform-app-id",
        subscribed_fields: ["messages", "messaging_postbacks", "message_reactions", "messaging_seen"]
      }] } };
    }
    if (request.url.endsWith("/v25.0/ig-direct")) {
      return { data: { user_id: "ig-direct", username: "nextfor.ia", name: "Nextfor IA" } };
    }
    throw new Error("Unexpected direct Instagram request: " + request.url);
  };
  directInstagramAxios.post = async function (url, body, options) {
    directInstagramRequests.push({ method: "POST", url, body, options });
    assert(url.endsWith("/oauth/access_token"));
    assert(String(body).includes("client_id=2073069230231933"));
    assert(!String(body).includes("state-secret-value"));
    return { data: { access_token: "short-instagram-token", user_id: "ig-direct" } };
  };
  directInstagramAxios.postForm = async function (url, body, options) {
    directInstagramRequests.push({ method: "POST_FORM", url, body, options });
    assert(url.endsWith("/oauth/access_token"));
    assert.strictEqual(body.client_id, "2073069230231933");
    assert.strictEqual(body.redirect_uri, "https://nextforia.com/admin/channel-connections/meta/callback");
    assert.strictEqual(body.code, "instagram-code");
    assert(!JSON.stringify(body).includes("state-secret-value"));
    return { data: { data: [{ access_token: "short-instagram-token", user_id: "ig-direct" }] } };
  };
  directInstagramAxios.get = async function (url, options) {
    directInstagramRequests.push({ method: "GET", url, options });
    if (url.endsWith("/access_token")) return { data: { access_token: "long-instagram-token" } };
    if (url.endsWith("/v25.0/me")) {
      return { data: { user_id: "ig-direct", username: "nextfor.ia", name: "Nextfor IA" } };
    }
    throw new Error("Unexpected direct Instagram GET: " + url);
  };
  const directInstagramMeta = new MetaChannelProvider({
    appId: "facebook-app-id",
    appSecret: "facebook-app-secret",
    instagramAppId: "2073069230231933",
    instagramAppSecret: "instagram-app-secret",
    instagramLoginEnabled: true,
    graphVersion: "v25.0",
    redirectUri: "https://nextforia.com/admin/channel-connections/meta/callback",
    axiosClient: directInstagramAxios
  });
  const directInstagramUrl = new URL(directInstagramMeta.authorizationUrl("instagram", state));
  assert.strictEqual(directInstagramUrl.hostname, "www.instagram.com");
  assert.strictEqual(directInstagramUrl.searchParams.get("client_id"), "2073069230231933");
  assert.strictEqual(directInstagramUrl.searchParams.get("force_authentication"), null);
  assert.strictEqual(directInstagramUrl.searchParams.get("force_reauth"), null);
  assert(directInstagramUrl.searchParams.get("scope").includes("instagram_business_manage_messages"));
  assert(!directInstagramUrl.searchParams.get("scope").includes("pages_show_list"));
  let directCredential = await directInstagramMeta.exchangeCode("instagram-code", {
    channel: "instagram",
    redirectUri: "https://nextforia.com/admin/channel-connections/meta/callback"
  });
  directCredential = await directInstagramMeta.extendUserAccessToken(directCredential);
  assert.strictEqual(directCredential.login_type, "instagram");
  assert.strictEqual(directCredential.access_token, "long-instagram-token");
  assert(directInstagramRequests.some(function (request) { return request.method === "POST_FORM"; }));
  const directCandidates = await directInstagramMeta.discoverAssets("instagram", directCredential);
  assert.strictEqual(directCandidates.length, 1);
  assert.strictEqual(directCandidates[0].account_label, "@nextfor.ia");
  assert.strictEqual(directCandidates[0].page_id, undefined);
  const activatedDirectInstagram = await directInstagramMeta.activate("instagram", directCandidates[0]);
  assert.strictEqual(activatedDirectInstagram.login_type, "instagram");
  assert(directInstagramRequests.some(function (request) {
    return request.url && request.url.includes("graph.instagram.com/v25.0/ig-direct/subscribed_apps");
  }));
  const directInstagramVerification = await directInstagramMeta.verify("instagram", activatedDirectInstagram);
  assert.strictEqual(directInstagramVerification.ok, true);

  const failedDirectInstagramAxios = async function () {
    throw new Error("Unexpected failed direct Instagram request");
  };
  failedDirectInstagramAxios.post = async function () {
    const error = new Error("Request failed with status code 400");
    error.response = { data: { error_type: "OAuthException", code: 400, error_message: "Invalid platform app" } };
    throw error;
  };
  failedDirectInstagramAxios.postForm = failedDirectInstagramAxios.post;
  const failedDirectInstagramMeta = new MetaChannelProvider({
    instagramAppId: "2073069230231933",
    instagramAppSecret: "instagram-app-secret",
    instagramLoginEnabled: true,
    redirectUri: "https://nextforia.com/admin/channel-connections/meta/callback",
    axiosClient: failedDirectInstagramAxios
  });
  let failedDirectInstagramError = null;
  try {
    await failedDirectInstagramMeta.exchangeCode("instagram-code", { channel: "instagram" });
  } catch (error) {
    failedDirectInstagramError = error;
  }
  assert.strictEqual(failedDirectInstagramError && failedDirectInstagramError.code, "invalid_authorization");
  assert.strictEqual(failedDirectInstagramError && failedDirectInstagramError.internalMessage, "Invalid platform app");

  const portfolioRequests = [];
  const portfolioMeta = new MetaChannelProvider({
    appId: "123456789",
    appSecret: "meta-app-secret",
    graphVersion: "v25.0",
    redirectUri: "https://nextforia.com/admin/channel-connections/meta/callback",
    axiosClient: async function (request) {
      portfolioRequests.push(request.url);
      if (request.url.endsWith("/me/accounts")) {
        return { data: { data: [{
          id: "page-rav",
          name: "RAV Toys",
          access_token: "page-token-rav",
          instagram_business_account: { id: "ig-rav", username: "ravtoys" }
        }] } };
      }
      if (request.url.endsWith("/me/businesses")) {
        return { data: { data: [
          { id: "business-rav", name: "RAV Toys Portfolio" },
          { id: "business-nextfor", name: "NextforIA Portfolio" }
        ] } };
      }
      if (request.url.endsWith("/business-rav/owned_pages")) {
        return { data: { data: [{
          id: "page-rav",
          name: "RAV Toys",
          instagram_business_account: { id: "ig-rav", username: "ravtoys" }
        }] } };
      }
      if (request.url.endsWith("/business-nextfor/owned_pages")) {
        return { data: { data: [{
          id: "page-nextfor",
          name: "Nextfor IA",
          access_token: "page-token-nextfor",
          instagram_business_account: { id: "ig-nextfor", username: "nextforia" }
        }] } };
      }
      if (request.url.endsWith("/client_pages")) return { data: { data: [] } };
      throw new Error("Unexpected Meta request: " + request.url);
    }
  });
  const portfolioCandidates = await portfolioMeta.discoverAssets("instagram", "user-access-token");
  assert.strictEqual(portfolioCandidates.length, 2);
  const ravPortfolioCandidate = portfolioCandidates.find(function (candidate) { return candidate.id === "ig:ig-rav"; });
  const nextforPortfolioCandidate = portfolioCandidates.find(function (candidate) { return candidate.id === "ig:ig-nextfor"; });
  assert(ravPortfolioCandidate.detail.includes("RAV Toys Portfolio"));
  assert.strictEqual(ravPortfolioCandidate.access_token, "page-token-rav");
  assert.strictEqual(ravPortfolioCandidate.meta_business_id, "business-rav");
  assert(nextforPortfolioCandidate.detail.includes("NextforIA Portfolio"));
  assert.strictEqual(nextforPortfolioCandidate.account_label, "@nextforia");
  assert(portfolioRequests.some(function (url) { return url.endsWith("/business-nextfor/owned_pages"); }));

  const activationRequests = [];
  const activationMeta = new MetaChannelProvider({
    appId: "123456789",
    appSecret: "meta-app-secret",
    whatsappConfigId: "wa-config-123",
    graphVersion: "v25.0",
    redirectUri: "https://nextforia.com/admin/channel-connections/meta/callback",
    axiosClient: async function (request) {
      activationRequests.push(request);
      return {
        data: request.url.endsWith("/ig-rav")
          ? { id: "ig-rav", username: "ravtoys", name: "RAV Toys" }
          : request.url.endsWith("/phone-rav")
            ? {
                id: "phone-rav",
                display_phone_number: "+57 301 587 2708",
                code_verification_status: "VERIFIED",
                platform_type: "CLOUD_API"
              }
          : { success: true }
      };
    }
  });
  const activatedInstagram = await activationMeta.activate("instagram", {
    page_id: "page-rav",
    instagram_user_id: "ig-rav",
    account_label: "@ravtoys",
    access_token: "page-access-token"
  });
  assert.strictEqual(activatedInstagram.account_label, "@ravtoys");
  assert.strictEqual(
    activationRequests[0].params.subscribed_fields,
    "messages,messaging_postbacks,message_reactions,messaging_seen"
  );
  assert(!activationRequests[0].params.subscribed_fields.includes("message_reads"));

  activationRequests.length = 0;
  await activationMeta.activate("messenger", {
    page_id: "page-rav",
    account_label: "RAV Toys",
    access_token: "page-access-token"
  });
  assert.strictEqual(
    activationRequests[0].params.subscribed_fields,
    "messages,messaging_postbacks,messaging_optins,message_deliveries,message_reads"
  );
  assert(!activationRequests[0].params.subscribed_fields.includes("messaging_reads"));

  activationRequests.length = 0;
  const activatedWhatsApp = await activationMeta.activate("whatsapp", {
    whatsapp_business_account_id: "waba-rav",
    phone_number_id: "phone-rav",
    account_label: "+57 301 587 2708",
    access_token: "whatsapp-access-token",
    registration_pin: "246810"
  });
  assert.strictEqual(activatedWhatsApp.account_label, "+57 301 587 2708");
  assert(activationRequests[0].url.endsWith("/waba-rav/subscribed_apps"));
  assert(activationRequests[1].url.endsWith("/phone-rav"));
  assert.strictEqual(activationRequests[1].method, "POST");
  assert.strictEqual(activationRequests[1].data.pin, "246810");
  assert(activationRequests[2].url.endsWith("/phone-rav/register"));
  assert.strictEqual(activationRequests[2].method, "POST");
  assert.strictEqual(activationRequests[2].data.messaging_product, "whatsapp");
  assert.strictEqual(activationRequests[2].data.pin, "246810");
  assert(!JSON.stringify(activationRequests).includes("meta-app-secret"));
  assert(activationRequests[3].url.endsWith("/phone-rav"));

  activationRequests.length = 0;
  const activatedCoexistence = await activationMeta.activate("whatsapp", {
    whatsapp_business_account_id: "waba-rav",
    phone_number_id: "phone-rav",
    account_label: "+57 301 587 2708",
    access_token: "whatsapp-access-token",
    coexistence: true,
    registration_pin: "135790"
  });
  assert.strictEqual(activatedCoexistence.account_label, "+57 301 587 2708");
  assert(activationRequests[0].url.endsWith("/waba-rav/subscribed_apps"));
  assert(activationRequests[1].url.endsWith("/phone-rav"));
  assert.strictEqual(activationRequests[1].method, "POST");
  assert.strictEqual(activationRequests[1].data.pin, "135790");
  assert(activationRequests[2].url.endsWith("/phone-rav/register"));
  assert.strictEqual(activationRequests[2].method, "POST");
  assert.strictEqual(activationRequests[2].data.pin, "135790");
  assert(activationRequests[3].url.endsWith("/phone-rav"));

  const failedSetPinMeta = new MetaChannelProvider({
    appId: "123456789",
    appSecret: "meta-app-secret",
    whatsappConfigId: "wa-config-123",
    graphVersion: "v25.0",
    redirectUri: "https://nextforia.com/admin/channel-connections/meta/callback",
    axiosClient: async function (request) {
      if (request.url.endsWith("/phone-pin-failed") && request.method === "POST") {
        const error = new Error("Request failed with status code 400");
        error.response = { data: { error: {
          message: "Two-step verification PIN could not be changed",
          type: "OAuthException",
          code: 100,
          error_subcode: 2388003,
          fbtrace_id: "trace-set-pin-safe"
        } } };
        throw error;
      }
      return { data: { success: true } };
    }
  });
  let failedSetPinError = null;
  try {
    await failedSetPinMeta.activate("whatsapp", {
      whatsapp_business_account_id: "waba-pin-failed",
      phone_number_id: "phone-pin-failed",
      access_token: "never-log-set-pin-token",
      coexistence: true,
      registration_pin: "975310"
    });
  } catch (error) {
    failedSetPinError = error;
  }
  assert.strictEqual(failedSetPinError && failedSetPinError.code, "asset_activation_failed");
  assert.strictEqual(failedSetPinError && failedSetPinError.activationStage, "set_pin");
  assert.strictEqual(failedSetPinError && failedSetPinError.meta.meta_code, 100);
  assert.strictEqual(failedSetPinError && failedSetPinError.meta.meta_subcode, 2388003);
  assert(!JSON.stringify(failedSetPinError.meta).includes("never-log-set-pin-token"));
  assert(!JSON.stringify(failedSetPinError.meta).includes("975310"));

  const pendingActivationMeta = new MetaChannelProvider({
    appId: "123456789",
    appSecret: "meta-app-secret",
    whatsappConfigId: "wa-config-123",
    graphVersion: "v25.0",
    redirectUri: "https://nextforia.com/admin/channel-connections/meta/callback",
    axiosClient: async function (request) {
      if (request.url.endsWith("/phone-pending")) {
        return {
          data: {
            id: "phone-pending",
            display_phone_number: "+57 310 6534553",
            code_verification_status: "VERIFIED",
            platform_type: "WHATSAPP_BUSINESS_APP"
          }
        };
      }
      return { data: { success: true } };
    }
  });
  const pendingActivationCandidate = await pendingActivationMeta.activate("whatsapp", {
    whatsapp_business_account_id: "waba-pending",
    phone_number_id: "phone-pending",
    account_label: "+57 310 6534553",
    access_token: "pending-business-token",
    coexistence: true
  });
  assert.strictEqual(pendingActivationCandidate.activation_pending, true);
  assert.strictEqual(pendingActivationCandidate.account_label, "+57 310 6534553");

  const failedRegistrationMeta = new MetaChannelProvider({
    appId: "123456789",
    appSecret: "meta-app-secret",
    whatsappConfigId: "wa-config-123",
    graphVersion: "v25.0",
    redirectUri: "https://nextforia.com/admin/channel-connections/meta/callback",
    axiosClient: async function (request) {
      if (request.url.endsWith("/phone-failed/register")) {
        const error = new Error("Request failed with status code 400");
        error.response = { data: { error: {
          message: "Registration PIN is invalid",
          type: "OAuthException",
          code: 100,
          error_subcode: 2388003,
          fbtrace_id: "trace-safe"
        } } };
        throw error;
      }
      if (request.url.endsWith("/phone-failed")) {
        return { data: {
          id: "phone-failed",
          code_verification_status: "VERIFIED",
          platform_type: "WHATSAPP_BUSINESS_APP"
        } };
      }
      return { data: { success: true } };
    }
  });
  let failedRegistrationError = null;
  try {
    await failedRegistrationMeta.activate("whatsapp", {
      whatsapp_business_account_id: "waba-failed",
      phone_number_id: "phone-failed",
      access_token: "never-log-this-token",
      coexistence: true,
      registration_pin: "112233"
    });
  } catch (error) {
    failedRegistrationError = error;
  }
  assert.strictEqual(failedRegistrationError && failedRegistrationError.code, "asset_activation_failed");
  assert.strictEqual(failedRegistrationError && failedRegistrationError.activationStage, "register");
  assert.strictEqual(failedRegistrationError && failedRegistrationError.meta.meta_code, 100);
  assert.strictEqual(failedRegistrationError && failedRegistrationError.meta.meta_subcode, 2388003);
  assert.strictEqual(failedRegistrationError && failedRegistrationError.meta.meta_type, "OAuthException");
  assert.strictEqual(failedRegistrationError && failedRegistrationError.meta.meta_message, "Registration PIN is invalid");
  assert(!JSON.stringify(failedRegistrationError.meta).includes("never-log-this-token"));

  const currentWhatsAppSubscriptionShape = new MetaChannelProvider({
    appId: "123456789",
    appSecret: "meta-app-secret",
    whatsappConfigId: "wa-config-123",
    graphVersion: "v25.0",
    redirectUri: "https://nextforia.com/admin/channel-connections/meta/callback",
    axiosClient: async function (request) {
      if (request.url.endsWith("/waba-rav/subscribed_apps")) {
        return {
          data: {
            data: [{
              whatsapp_business_api_data: {
                id: "123456789",
                name: "NextforIA Chatbot"
              }
            }]
          }
        };
      }
      return {
        data: {
          id: "phone-rav",
          display_phone_number: "+57 301 587 2708",
          code_verification_status: "VERIFIED",
          platform_type: "CLOUD_API"
        }
      };
    }
  });
  const currentShapeVerification = await currentWhatsAppSubscriptionShape.verify("whatsapp", {
    whatsapp_business_account_id: "waba-rav",
    phone_number_id: "phone-rav",
    access_token: "whatsapp-access-token"
  });
  assert.strictEqual(currentShapeVerification.ok, true);

  let verificationResponses = [{ ok: false, error: "Meta token expired" }];
  let subscriptionRepairs = 0;
  const provider = {
    configured: function () { return true; },
    authorizationUrl: function (channel, signedState) {
      return "https://www.facebook.com/v23.0/dialog/oauth?channel=" + channel + "&state=" + encodeURIComponent(signedState);
    },
    exchangeCode: async function (code) {
      if (code !== "valid-code") throw new ChannelConnectionError("invalid_authorization", 422, "OAuth code invalid");
      return "secret-user-access-token";
    },
    discoverAssets: async function (channel, accessToken) {
      assert.strictEqual(accessToken, "secret-user-access-token");
      return [
        {
          id: channel + ":asset-one",
          label: "Cuenta Uno",
          detail: "Negocio Uno",
          account_id: "asset-one",
          account_label: "Cuenta Uno",
          page_id: channel === "whatsapp" ? null : "page-one",
          instagram_user_id: channel === "instagram" ? "ig-one" : null,
          access_token: "secret-page-token-one"
        },
        {
          id: channel + ":asset-two",
          label: "Cuenta Dos",
          detail: "Negocio Dos",
          account_id: "asset-two",
          account_label: "Cuenta Dos",
          page_id: channel === "whatsapp" ? null : "page-two",
          instagram_user_id: channel === "instagram" ? "ig-two" : null,
          access_token: "secret-page-token-two"
        }
      ];
    },
    activate: async function (channel, candidate) {
      assert.strictEqual(channel, "instagram");
      return candidate;
    },
    verify: async function () {
      return verificationResponses.length > 1
        ? verificationResponses.shift()
        : verificationResponses[0];
    },
    subscribe: async function () {
      subscriptionRepairs++;
      return { ok: true };
    },
    disconnect: async function (_, credential) {
      assert.strictEqual(credential.access_token, "secret-page-token-two");
      return { ok: true };
    }
  };

  const store = new InMemoryChannelConnectionStore();
  const encryptionKey = crypto.randomBytes(32);
  const service = createChannelConnectionService({
    store,
    provider,
    encryptionKey,
    now: function () { return new Date("2026-07-26T12:00:00.000Z"); }
  });

  const adoptedStore = new InMemoryChannelConnectionStore();
  const adoptedService = createChannelConnectionService({
    store: adoptedStore,
    provider: {
      configured: function () { return true; },
      activate: async function (channel, candidate) {
        assert.strictEqual(channel, "whatsapp");
        assert.strictEqual(candidate.whatsapp_business_account_id, "waba-existing");
        assert.strictEqual(candidate.phone_number_id, "phone-existing");
        return Object.assign({}, candidate, {
          account_id: candidate.phone_number_id,
          account_label: "+57 301 587 2708"
        });
      }
    },
    encryptionKey,
    now: function () { return new Date("2026-07-26T11:00:00.000Z"); }
  });
  const adopted = await adoptedService.adoptExisting("tenant-rav", "whatsapp", "system:environment", {
    id: "wa:phone-existing",
    account_id: "phone-existing",
    account_label: "+57 301 587 2708",
    whatsapp_business_account_id: "waba-existing",
    phone_number_id: "phone-existing",
    access_token: "system-user-token"
  });
  assert.strictEqual(adopted.status, "connected");
  assert.strictEqual(adopted.tenant_id, "tenant-rav");
  assert.strictEqual(adopted.phone_number_id, "phone-existing");
  assert(!JSON.stringify(adopted).includes("system-user-token"));
  const adoptedStored = await adoptedStore.get("tenant-rav", "whatsapp");
  assert.strictEqual(adoptedStored.credential_source, "oauth");
  assert(adoptedStored.credentials_ciphertext.startsWith("enc:v1:"));
  assert(!adoptedStored.credentials_ciphertext.includes("system-user-token"));

  let duplicateActivations = 0;
  const isolatedAssetStore = new InMemoryChannelConnectionStore();
  const isolatedAssetService = createChannelConnectionService({
    store: isolatedAssetStore,
    provider: {
      configured: function () { return true; },
      activate: async function (_, candidate) {
        duplicateActivations++;
        return candidate;
      }
    },
    encryptionKey
  });
  await isolatedAssetService.adoptExisting("tenant-rav", "instagram", "owner@rav.example", {
    account_id: "ig-rav",
    account_label: "@ravtoys",
    instagram_user_id: "ig-rav",
    page_id: "page-rav",
    access_token: "rav-instagram-token"
  });
  assert.strictEqual(duplicateActivations, 1);
  await expectCode(isolatedAssetService.adoptExisting("tenant-nextfor", "instagram", "owner@nextfor.example", {
    account_id: "ig-rav",
    account_label: "@ravtoys",
    instagram_user_id: "ig-rav",
    page_id: "page-rav",
    access_token: "wrong-tenant-token"
  }), "channel_asset_already_assigned");
  assert.strictEqual(duplicateActivations, 1, "a conflicting asset must be rejected before Meta subscription");
  assert.strictEqual((await isolatedAssetStore.get("tenant-rav", "instagram")).status, "connected");
  assert.strictEqual((await isolatedAssetStore.get("tenant-nextfor", "instagram")).status, "needs_attention");

  const reviewOwnershipStore = new InMemoryChannelConnectionStore();
  let reviewOwnershipActivations = 0;
  const reviewOwnershipService = createChannelConnectionService({
    store: reviewOwnershipStore,
    provider: {
      configured: function () { return true; },
      activate: async function (_, candidate) {
        reviewOwnershipActivations++;
        return candidate;
      }
    },
    encryptionKey,
    replaceableOwnershipTenant: function (ownerTenantId, requestedTenantId) {
      return /^meta-app-review-/.test(ownerTenantId) && !/^meta-app-review-/.test(requestedTenantId);
    }
  });
  await reviewOwnershipService.adoptExisting("meta-app-review-nextforia-demo", "instagram", "reviewer@meta.example", {
    account_id: "ig-nextfor",
    account_label: "@nextfor.ia",
    instagram_user_id: "ig-nextfor",
    access_token: "review-instagram-token"
  });
  const liveOwnership = await reviewOwnershipService.adoptExisting("nextforia-live", "instagram", "admin@nextforia.example", {
    account_id: "ig-nextfor",
    account_label: "@nextfor.ia",
    instagram_user_id: "ig-nextfor",
    access_token: "live-instagram-token"
  });
  assert.strictEqual(liveOwnership.status, "connected");
  assert.strictEqual(reviewOwnershipActivations, 2);
  const retiredReviewOwnership = await reviewOwnershipStore.get("meta-app-review-nextforia-demo", "instagram");
  assert.strictEqual(retiredReviewOwnership.status, "disconnected");
  assert.strictEqual(retiredReviewOwnership.instagram_user_id, null);
  assert.strictEqual(retiredReviewOwnership.credentials_ciphertext, null);
  assert(reviewOwnershipStore.audit.some(function (event) {
    return event.action === "temporary_ownership_released" &&
      event.details.replacement_tenant_id === "nextforia-live";
  }));
  await expectCode(reviewOwnershipService.adoptExisting("meta-app-review-second-demo", "instagram", "reviewer@meta.example", {
    account_id: "ig-nextfor",
    account_label: "@nextfor.ia",
    instagram_user_id: "ig-nextfor",
    access_token: "second-review-token"
  }), "channel_asset_already_assigned");

  const aliasedAssetStore = new InMemoryChannelConnectionStore();
  const aliasedAssetService = createChannelConnectionService({
    store: aliasedAssetStore,
    provider: {
      configured: function () { return true; },
      activate: async function (_, candidate) { return candidate; }
    },
    encryptionKey,
    tenantAliases: { "rav-toys-adac1e": "rav-toys" }
  });
  await aliasedAssetService.adoptExisting("rav-toys", "instagram", "legacy@rav.example", {
    account_id: "ig-rav-alias",
    account_label: "@ravtoys",
    instagram_user_id: "ig-rav-alias",
    access_token: "legacy-rav-token"
  });
  const aliasedAdoption = await aliasedAssetService.adoptExisting("rav-toys-adac1e", "instagram", "admin@rav.example", {
    account_id: "ig-rav-alias",
    account_label: "@ravtoys",
    instagram_user_id: "ig-rav-alias",
    access_token: "current-rav-token"
  });
  assert.strictEqual(aliasedAdoption.status, "connected");
  await expectCode(aliasedAssetService.adoptExisting("tenant-other", "instagram", "admin@other.example", {
    account_id: "ig-rav-alias",
    account_label: "@ravtoys",
    instagram_user_id: "ig-rav-alias",
    access_token: "wrong-owner-token"
  }), "channel_asset_already_assigned");

  let repairedSubscriptions = 0;
  const repairStore = new InMemoryChannelConnectionStore();
  const repairService = createChannelConnectionService({
    store: repairStore,
    provider: {
      configured: function () { return true; },
      activate: async function (_, candidate) { return candidate; },
      subscribe: async function (channel, credential) {
        assert.strictEqual(channel, "whatsapp");
        assert.strictEqual(credential.whatsapp_business_account_id, "waba-repair");
        assert.strictEqual(credential.access_token, "repair-token");
        repairedSubscriptions++;
        return { ok: true };
      },
      verify: async function () {
        return { ok: true, account_label: "+57 301 587 2708" };
      }
    },
    encryptionKey,
    now: function () { return new Date("2026-07-29T18:00:00.000Z"); }
  });
  await repairService.adoptExisting("tenant-repair", "whatsapp", "system:bootstrap", {
    account_id: "phone-repair",
    account_label: "+57 301 587 2708",
    whatsapp_business_account_id: "waba-repair",
    phone_number_id: "phone-repair",
    access_token: "repair-token",
    coexistence: true
  });
  const repairedConnection = await repairService.repairSubscription(
    "tenant-repair",
    "whatsapp",
    "system:webhook-repair"
  );
  assert.strictEqual(repairedSubscriptions, 1);
  assert.strictEqual(repairedConnection.status, "connected");
  assert.strictEqual(repairedConnection.webhook_status, "subscribed");
  assert(!JSON.stringify(repairedConnection).includes("repair-token"));

  const embeddedStore = new InMemoryChannelConnectionStore();
  const embeddedService = createChannelConnectionService({
    store: embeddedStore,
    provider: {
      configured: function () { return true; },
      prepareEmbeddedWhatsApp: async function (code, session) {
        assert.strictEqual(code, "embedded-code");
        assert.strictEqual(session.waba_id, "waba-smb");
        assert.strictEqual(session.phone_number_id, "phone-smb");
        return {
          id: "wa:phone-smb",
          account_id: "phone-smb",
          account_label: "+57 301 587 2708",
          whatsapp_business_account_id: "waba-smb",
          phone_number_id: "phone-smb",
          access_token: "embedded-business-token",
          coexistence: true
        };
      },
      activate: async function (channel, candidate) {
        assert.strictEqual(channel, "whatsapp");
        assert.strictEqual(candidate.coexistence, true);
        return candidate;
      }
    },
    encryptionKey,
    now: function () { return new Date("2026-07-28T22:00:00.000Z"); }
  });
  const embedded = await embeddedService.completeEmbeddedWhatsApp({
    tenant_id: "tenant-smb",
    actor: "owner@smb.example",
    code: "embedded-code",
    session: { waba_id: "waba-smb", phone_number_id: "phone-smb" }
  });
  assert.strictEqual(embedded.connection.status, "connected");
  assert.strictEqual(embedded.connection.account_label, "+57 301 587 2708");
  assert(!JSON.stringify(embedded).includes("embedded-business-token"));
  const embeddedStored = await embeddedStore.get("tenant-smb", "whatsapp");
  assert(embeddedStored.credentials_ciphertext.startsWith("enc:v1:"));

  const pendingEmbeddedStore = new InMemoryChannelConnectionStore();
  let pendingActivationCalls = 0;
  const pendingEmbeddedService = createChannelConnectionService({
    store: pendingEmbeddedStore,
    provider: {
      configured: function () { return true; },
      prepareEmbeddedWhatsApp: async function () {
        return {
          id: "wa:phone-pending",
          account_id: "phone-pending",
          account_label: "+57 310 6534553",
          whatsapp_business_account_id: "waba-pending",
          phone_number_id: "phone-pending",
          access_token: "pending-business-token",
          coexistence: true
        };
      },
      activate: async function (_, candidate) {
        pendingActivationCalls++;
        return pendingActivationCalls < 2
          ? Object.assign({}, candidate, {
              activation_pending: true,
              activation_error: "WhatsApp number is awaiting Cloud API activation"
            })
          : Object.assign({}, candidate, { activation_pending: false });
      },
      verify: async function () {
        return {
          ok: false,
          error: "WhatsApp number has not completed Cloud API registration"
        };
      }
    },
    encryptionKey,
    now: function () { return new Date("2026-08-03T20:55:00.000Z"); }
  });
  const pendingEmbedded = await pendingEmbeddedService.completeEmbeddedWhatsApp({
    tenant_id: "nextforia-d4cd6d",
    actor: "santiago@nextforia.com",
    code: "pending-code",
    session: { waba_id: "waba-pending", phone_number_id: "phone-pending" }
  });
  assert.strictEqual(pendingEmbedded.status, "connecting");
  assert.strictEqual(pendingEmbedded.connection.webhook_status, "pending_activation");
  assert.strictEqual(pendingEmbedded.connection.activation_available, true);
  assert.strictEqual(pendingEmbedded.connection.reconnect_available, true);
  assert.strictEqual(pendingEmbedded.connection.account_label, "+57 310 6534553");
  const pendingEmbeddedStored = await pendingEmbeddedStore.get("nextforia-d4cd6d", "whatsapp");
  assert(pendingEmbeddedStored.credentials_ciphertext.startsWith("enc:v1:"));
  assert.strictEqual(pendingEmbeddedStored.phone_number_id, "phone-pending");
  const stillPending = await pendingEmbeddedService.verify("nextforia-d4cd6d", "whatsapp", "system:auto-verify");
  assert.strictEqual(stillPending.status, "connecting");
  assert.strictEqual(stillPending.webhook_status, "pending_activation");
  assert.strictEqual(stillPending.last_error, null);
  const activatedAfterReview = await pendingEmbeddedService.activateWhatsApp(
    "nextforia-d4cd6d",
    "santiago@nextforia.com",
    { pin: "123456" }
  );
  assert.strictEqual(activatedAfterReview.status, "connected");
  assert.strictEqual(activatedAfterReview.webhook_status, "subscribed");
  assert.strictEqual(activatedAfterReview.activation_available, false);
  assert.strictEqual(pendingActivationCalls, 2);
  const activatedStored = await pendingEmbeddedStore.get("nextforia-d4cd6d", "whatsapp");
  assert(activatedStored.credentials_ciphertext.startsWith("enc:v1:"));
  assert.strictEqual(Object.prototype.hasOwnProperty.call(activatedStored, "registration_pin"), false);
  assert(!JSON.stringify(pendingEmbeddedStore.audit).includes("123456"));
  assert(!JSON.stringify(activatedAfterReview).includes("pending-business-token"));
  await expectCode(
    pendingEmbeddedService.activateWhatsApp(
      "nextforia-d4cd6d",
      "santiago@nextforia.com",
      { pin: "12345" }
    ),
    "whatsapp_registration_pin_required"
  );
  await expectCode(
    pendingEmbeddedService.activateWhatsApp("different-tenant", "other@example.com"),
    "connection_not_found"
  );

  const singleFlightStore = new InMemoryChannelConnectionStore();
  let releaseSingleFlight;
  const singleFlightGate = new Promise(function (resolve) { releaseSingleFlight = resolve; });
  let singleFlightRegistrations = 0;
  const singleFlightService = createChannelConnectionService({
    store: singleFlightStore,
    provider: {
      configured: function () { return true; },
      prepareEmbeddedWhatsApp: async function () {
        return {
          id: "wa:phone-single-flight",
          account_id: "phone-single-flight",
          account_label: "+57 310 000 0001",
          whatsapp_business_account_id: "waba-single-flight",
          phone_number_id: "phone-single-flight",
          access_token: "single-flight-token",
          coexistence: true
        };
      },
      activate: async function (_, candidate) {
        if (!candidate.registration_pin) {
          return Object.assign({}, candidate, {
            activation_pending: true,
            activation_error: "WhatsApp registration requires the existing two-step verification PIN"
          });
        }
        singleFlightRegistrations++;
        await singleFlightGate;
        return Object.assign({}, candidate, { activation_pending: false });
      }
    },
    encryptionKey
  });
  await singleFlightService.completeEmbeddedWhatsApp({
    tenant_id: "tenant-single-flight",
    actor: "owner@single-flight.example",
    code: "single-flight-code",
    session: { waba_id: "waba-single-flight", phone_number_id: "phone-single-flight" }
  });
  const firstSingleFlight = singleFlightService.activateWhatsApp(
    "tenant-single-flight",
    "owner@single-flight.example",
    { pin: "654321" }
  );
  await new Promise(function (resolve) { setImmediate(resolve); });
  await expectCode(
    singleFlightService.activateWhatsApp(
      "tenant-single-flight",
      "owner@single-flight.example",
      { pin: "654321" }
    ),
    "whatsapp_activation_in_progress"
  );
  assert.strictEqual(singleFlightRegistrations, 1);
  releaseSingleFlight();
  await firstSingleFlight;
  assert(!JSON.stringify(singleFlightStore.audit).includes("654321"));

  const failedActivationStore = new InMemoryChannelConnectionStore();
  let failStoredActivation = false;
  const failedActivationService = createChannelConnectionService({
    store: failedActivationStore,
    provider: {
      configured: function () { return true; },
      prepareEmbeddedWhatsApp: async function () {
        return {
          id: "wa:phone-failure",
          account_id: "phone-failure",
          account_label: "+57 300 000 0000",
          whatsapp_business_account_id: "waba-failure",
          phone_number_id: "phone-failure",
          access_token: "failure-token",
          coexistence: true
        };
      },
      activate: async function (_, candidate) {
        if (failStoredActivation) {
          throw new ChannelConnectionError(
            "asset_activation_failed",
            422,
            "OAuth access token expired"
          );
        }
        return Object.assign({}, candidate, {
          activation_pending: true,
          activation_error: "WhatsApp number is awaiting Cloud API activation"
        });
      }
    },
    encryptionKey,
    now: function () { return new Date("2026-08-03T21:10:00.000Z"); }
  });
  await failedActivationService.completeEmbeddedWhatsApp({
    tenant_id: "tenant-failure",
    actor: "owner@failure.example",
    code: "failure-code",
    session: { waba_id: "waba-failure", phone_number_id: "phone-failure" }
  });
  failStoredActivation = true;
  await expectCode(
    failedActivationService.activateWhatsApp("tenant-failure", "owner@failure.example", { pin: "123456" }),
    "asset_activation_failed"
  );
  const failedStored = await failedActivationStore.get("tenant-failure", "whatsapp");
  assert.strictEqual(failedStored.status, "needs_attention");
  assert.strictEqual(failedStored.last_error, "OAuth access token expired");
  assert(failedStored.last_error_at);
  assert(failedStored.credentials_ciphertext.startsWith("enc:v1:"));
  const failedPublic = (await failedActivationService.listTenant("tenant-failure"))
    .find(function (row) { return row.channel === "whatsapp"; });
  assert.strictEqual(failedPublic.activation_available, true);
  assert.strictEqual(
    failedPublic.activation_error,
    "La autorización de Meta venció o fue revocada. Vuelve a autorizar WhatsApp."
  );
  assert(!Object.prototype.hasOwnProperty.call(failedPublic, "last_error"));
  assert(!JSON.stringify(failedPublic).includes("failure-token"));

  const rateLimitedStore = new InMemoryChannelConnectionStore();
  let rateLimitedNow = new Date("2026-08-08T12:16:09.938Z");
  let rateLimitedActivationCalls = 0;
  let triggerRateLimit = false;
  const rateLimitedService = createChannelConnectionService({
    store: rateLimitedStore,
    provider: {
      configured: function () { return true; },
      prepareEmbeddedWhatsApp: async function () {
        return {
          id: "wa:phone-rate-limited",
          account_id: "phone-rate-limited",
          account_label: "+57 310 6534553",
          whatsapp_business_account_id: "waba-rate-limited",
          phone_number_id: "phone-rate-limited",
          access_token: "rate-limited-token",
          coexistence: true
        };
      },
      activate: async function (_, candidate) {
        rateLimitedActivationCalls++;
        if (triggerRateLimit && candidate.registration_pin) {
          const problem = new ChannelConnectionError(
            "asset_activation_failed",
            422,
            "(#133016) Registration or Deregistration failed because there were too many attempts for this phone number in a short period of time"
          );
          problem.activationStage = "register";
          problem.meta = { meta_code: 133016, meta_message: problem.internalMessage };
          throw problem;
        }
        return Object.assign({}, candidate, {
          activation_pending: rateLimitedActivationCalls === 1,
          activation_error: "WhatsApp number is awaiting Cloud API activation"
        });
      }
    },
    encryptionKey,
    now: function () { return rateLimitedNow; }
  });
  await rateLimitedService.completeEmbeddedWhatsApp({
    tenant_id: "tenant-rate-limited",
    actor: "owner@rate-limited.example",
    code: "rate-limited-code",
    session: { waba_id: "waba-rate-limited", phone_number_id: "phone-rate-limited" }
  });
  triggerRateLimit = true;
  await expectCode(
    rateLimitedService.activateWhatsApp("tenant-rate-limited", "owner@rate-limited.example", { pin: "123456" }),
    "whatsapp_activation_rate_limited"
  );
  const callsAtRateLimit = rateLimitedActivationCalls;
  const rateLimitedPublic = (await rateLimitedService.listTenant("tenant-rate-limited"))
    .find(function (row) { return row.channel === "whatsapp"; });
  assert.strictEqual(rateLimitedPublic.activation_rate_limited, true);
  assert.strictEqual(rateLimitedPublic.activation_available, true);
  assert.strictEqual(rateLimitedPublic.reconnect_available, false);
  assert.strictEqual(rateLimitedPublic.activation_retry_at, "2026-08-11T12:16:09.938Z");
  assert(rateLimitedPublic.activation_message.includes("no volverá a registrar"));
  await expectCode(
    rateLimitedService.activateWhatsApp("tenant-rate-limited", "owner@rate-limited.example", { pin: "123456" }),
    "whatsapp_activation_rate_limited"
  );
  assert.strictEqual(rateLimitedActivationCalls, callsAtRateLimit);
  const safeReauthorization = await rateLimitedService.completeEmbeddedWhatsApp({
    tenant_id: "tenant-rate-limited",
    actor: "owner@rate-limited.example",
    code: "second-rate-limited-code",
    session: { waba_id: "waba-rate-limited", phone_number_id: "phone-rate-limited" }
  });
  assert.strictEqual(safeReauthorization.connection.status, "connected");
  assert.strictEqual(rateLimitedActivationCalls, callsAtRateLimit + 1);
  const preservedRateLimit = await rateLimitedStore.get("tenant-rate-limited", "whatsapp");
  assert.strictEqual(preservedRateLimit.last_error_at, null);
  rateLimitedNow = new Date("2026-08-11T12:16:10.000Z");
  triggerRateLimit = false;
  const recoveredRateLimited = await rateLimitedService.activateWhatsApp(
    "tenant-rate-limited",
    "owner@rate-limited.example",
    { pin: "123456" }
  );
  assert.strictEqual(recoveredRateLimited.status, "connected");
  assert.strictEqual(recoveredRateLimited.activation_rate_limited, false);

  const beginUrl = await service.begin("tenant-a", "instagram", "admin@a.example", state);
  assert(beginUrl.startsWith("https://www.facebook.com/"));
  let tenantA = await service.listTenant("tenant-a");
  const connectingInstagram = tenantA.find(function (row) { return row.channel === "instagram"; });
  assert.strictEqual(connectingInstagram.status, "connecting");
  assert.strictEqual(connectingInstagram.reconnect_available, true);
  let tenantB = await service.listTenant("tenant-b");
  assert.strictEqual(tenantB.find(function (row) { return row.channel === "instagram"; }).status, "not_connected");

  const pending = await service.completeAuthorization({
    tenant_id: "tenant-a",
    channel: "instagram",
    actor: "admin@a.example",
    code: "valid-code"
  });
  assert.strictEqual(pending.status, "selection_required");
  assert.strictEqual(pending.connection.pending_assets.length, 2);
  assert(!JSON.stringify(pending).includes("secret-user-access-token"));
  assert(!JSON.stringify(pending).includes("secret-page-token"));
  assert(store.rows[0].credentials_ciphertext.startsWith("enc:v1:"));
  assert(!JSON.stringify(store.rows[0]).includes("secret-user-access-token"));

  const connected = await service.selectAsset("tenant-a", "instagram", "instagram:asset-two", "admin@a.example");
  assert.strictEqual(connected.status, "connected");
  assert.strictEqual(connected.account_label, "Cuenta Dos");
  assert.strictEqual(connected.instagram_user_id, undefined);
  assert(!JSON.stringify(connected).includes("token"));

  const verification = await service.verify("tenant-a", "instagram", "support@nextforia.com");
  assert.strictEqual(verification.status, "needs_attention");
  assert.strictEqual(verification.last_error, "Meta token expired");
  tenantA = await service.listTenant("tenant-a");
  const publicAttention = tenantA.find(function (row) { return row.channel === "instagram"; });
  assert.strictEqual(publicAttention.status, "needs_attention");
  assert.strictEqual("last_error" in publicAttention, false);

  verificationResponses = [
    { ok: false, error: "Meta webhook subscription is missing" },
    { ok: true, account_label: "Cuenta Dos" }
  ];
  const repairedVerification = await service.verify("tenant-a", "instagram", "support@nextforia.com");
  assert.strictEqual(repairedVerification.status, "connected");
  assert.strictEqual(repairedVerification.webhook_status, "subscribed");
  assert.strictEqual(subscriptionRepairs, 1);

  const credentialBeforeDisconnect = store.rows[0].credentials_ciphertext;
  const disconnected = await service.disconnect("tenant-a", "instagram", "admin@a.example");
  assert.strictEqual(disconnected.status, "disconnected");
  assert.strictEqual(disconnected.account_label, null);
  assert.strictEqual(store.rows[0].credentials_ciphertext, null);
  assert.strictEqual(store.rows[0].account_id, null);
  assert.strictEqual(store.rows[0].account_label, null);
  assert.strictEqual(store.rows[0].instagram_user_id, null);
  assert.strictEqual(store.rows[0].page_id, null);
  assert(store.audit.some(function (event) {
    return event.action === "disconnected" && event.actor === "admin@a.example";
  }));

  const failedDisconnectStore = new InMemoryChannelConnectionStore();
  await failedDisconnectStore.upsert(Object.assign({}, store.rows[0], {
    tenant_id: "tenant-failed-disconnect",
    status: "connected",
    credentials_ciphertext: credentialBeforeDisconnect,
    credential_source: "oauth"
  }));
  const failedDisconnectService = createChannelConnectionService({
    store: failedDisconnectStore,
    provider: Object.assign({}, provider, {
      disconnect: async function () { return { ok: false, error: "Meta unsubscribe failed" }; }
    }),
    encryptionKey
  });
  await expectCode(
    failedDisconnectService.disconnect("tenant-failed-disconnect", "instagram", "owner@example.com"),
    "disconnect_failed"
  );
  const retainedAfterFailedDisconnect = await failedDisconnectStore.get("tenant-failed-disconnect", "instagram");
  assert.strictEqual(retainedAfterFailedDisconnect.status, "needs_attention");
  assert.strictEqual(retainedAfterFailedDisconnect.credentials_ciphertext, credentialBeforeDisconnect);
  assert.strictEqual(failedDisconnectStore.audit.at(-1).action, "disconnect_failed");

  tenantB = await service.listTenant("tenant-b");
  assert.strictEqual(tenantB.find(function (row) { return row.channel === "instagram"; }).status, "not_connected");

  await expectCode(service.completeAuthorization({
    tenant_id: "tenant-a",
    channel: "messenger",
    actor: "admin@a.example",
    code: "bad-code"
  }), "invalid_authorization");
  const all = await service.listAll([{ id: "tenant-a", company_name: "Empresa A" }, { id: "tenant-b", company_name: "Empresa B" }]);
  const failedMessenger = all.find(function (row) { return row.tenant_id === "tenant-a" && row.channel === "messenger"; });
  assert.strictEqual(failedMessenger.status, "needs_attention");
  assert.strictEqual(failedMessenger.last_error, "OAuth code invalid");
  assert(!JSON.stringify(all).includes("secret-page-token"));

  const appendRows = [];
  const appendOnlyStore = new AppendOnlyChannelConnectionStore({
    loadLatest: async function (recordId) {
      const found = appendRows.filter(function (row) { return row.record_id === recordId; }).at(-1);
      return found ? found.record : null;
    },
    loadAll: async function () {
      return appendRows.slice().reverse().map(function (row) { return row.record; });
    },
    append: async function (recordId, record, event) {
      appendRows.push({
        record_id: recordId,
        record: JSON.parse(JSON.stringify(record)),
        event: event && JSON.parse(JSON.stringify(event))
      });
    }
  });
  await appendOnlyStore.upsert({
    tenant_id: "tenant-a",
    channel: "whatsapp",
    status: "connecting",
    pending_assets: []
  }, { action: "oauth_started", actor: "a@example.com" });
  await appendOnlyStore.upsert({
    tenant_id: "tenant-b",
    channel: "whatsapp",
    status: "connected",
    account_label: "Empresa B"
  }, { action: "connected", actor: "b@example.com" });
  await appendOnlyStore.upsert({
    tenant_id: "tenant-a",
    channel: "whatsapp",
    status: "connected",
    account_label: "Empresa A"
  }, { action: "connected", actor: "a@example.com" });
  assert.strictEqual((await appendOnlyStore.get("tenant-a", "whatsapp")).account_label, "Empresa A");
  assert.strictEqual((await appendOnlyStore.get("tenant-b", "whatsapp")).account_label, "Empresa B");
  assert.strictEqual((await appendOnlyStore.listTenant("tenant-a")).length, 1);
  const appendAll = await appendOnlyStore.listAll();
  assert.strictEqual(appendAll.length, 2);
  assert.strictEqual(appendAll.find(function (row) { return row.tenant_id === "tenant-a"; }).account_label, "Empresa A");
  assert.strictEqual(appendRows.filter(function (row) { return row.event && row.event.actor === "a@example.com"; }).length, 2);

  const legacyStore = new InMemoryChannelConnectionStore();
  const legacy = createLegacyConnections({
    tenantId: "rav-toys",
    whatsapp: { configured: true, phoneNumberId: "rav-phone", displayPhone: "+57 301 000 0000" }
  });
  const legacyService = createChannelConnectionService({
    store: legacyStore,
    provider,
    encryptionKey: crypto.randomBytes(32),
    legacyConnections: legacy
  });
  const rav = await legacyService.listTenant("rav-toys", { superAdmin: true });
  assert.strictEqual(rav.find(function (row) { return row.channel === "whatsapp"; }).protected_legacy, true);
  assert.strictEqual(rav.find(function (row) { return row.channel === "whatsapp"; }).status, "needs_attention");
  await expectCode(legacyService.disconnect("rav-toys", "whatsapp", "super-admin"), "legacy_connection_protected");
  await expectCode(legacyService.begin("rav-toys", "whatsapp", "super-admin", state), "legacy_connection_protected");
  await legacyStore.upsert({
    tenant_id: "rav-toys",
    channel: "whatsapp",
    status: "disconnected",
    account_id: "stale-phone",
    account_label: "Stale account",
    credentials_ciphertext: null
  });
  const ravWithStaleRow = await legacyService.listTenant("rav-toys", { superAdmin: true });
  assert.strictEqual(ravWithStaleRow.find(function (row) { return row.channel === "whatsapp"; }).status, "needs_attention");
  assert.strictEqual(ravWithStaleRow.find(function (row) { return row.channel === "whatsapp"; }).account_id, "rav-phone");
  await legacyStore.upsert({
    tenant_id: "tenant-wrong-owner",
    channel: "whatsapp",
    status: "connected",
    account_id: "rav-phone",
    phone_number_id: "rav-phone",
    account_label: "Duplicated RAV phone",
    credentials_ciphertext: "enc:v1:duplicate"
  });
  const wrongOwnerRows = await legacyService.listTenant("tenant-wrong-owner", { superAdmin: true });
  assert.strictEqual(wrongOwnerRows.find(function (row) { return row.channel === "whatsapp"; }).status, "not_connected");
  assert.strictEqual(wrongOwnerRows.find(function (row) { return row.channel === "whatsapp"; }).account_id, null);
  await legacyStore.upsert({
    tenant_id: "rav-toys",
    channel: "whatsapp",
    status: "connected",
    protected_legacy: false,
    credentials_ciphertext: "enc:v1:existing-encrypted-credential"
  });
  const coexistenceUrl = await legacyService.begin("rav-toys", "whatsapp", "super-admin", state);
  assert(coexistenceUrl.includes("channel=whatsapp"));

  const optedInLegacyService = createChannelConnectionService({
    store: new InMemoryChannelConnectionStore(),
    provider,
    encryptionKey: crypto.randomBytes(32),
    legacyConnections: legacy,
    allowProtectedLegacyReconnect: function (tenantId, channel) {
      return tenantId === "rav-toys" && channel === "whatsapp";
    }
  });
  const optedInLegacyRows = await optedInLegacyService.listTenant("rav-toys");
  const optedInWhatsApp = optedInLegacyRows.find(function (row) { return row.channel === "whatsapp"; });
  assert.strictEqual(optedInWhatsApp.reconnect_available, true);
  assert.strictEqual(optedInWhatsApp.disconnect_available, false);
  const optedInUrl = await optedInLegacyService.begin("rav-toys", "whatsapp", "super-admin", state);
  assert(optedInUrl.includes("channel=whatsapp"));

  const upMigration = require("fs").readFileSync("docs/migrations/20260726_channel_connections_v1_up.sql", "utf8");
  assert.match(upMigration, /tenant_channel_connections/);
  assert.match(upMigration, /credentials_ciphertext is null or credentials_ciphertext like 'enc:v1:%'/);
  assert.match(upMigration, /force row level security/);
  assert.match(upMigration, /revoke all[\s\S]*from public, anon, authenticated/);

  console.log("channel-connections.test.js: ok");
})().catch(function (error) {
  console.error(error.stack || error.message);
  process.exit(1);
});
