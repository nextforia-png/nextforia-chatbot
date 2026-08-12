"use strict";

const assert = require("assert");
const crypto = require("crypto");
const {
  AppendOnlyChannelConnectionStore,
  ChannelConnectionError,
  InMemoryChannelConnectionStore,
  MetaChannelProvider,
  SupabaseChannelConnectionStore,
  createChannelConnectionService,
  createLegacyConnections,
  createOAuthState,
  readOAuthState
} = require("./channel-connections");
const { encryptStoredText } = require("./security");

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
    channel: "whatsapp",
    actor_id: "user-a",
    actor: "admin@a.example",
    return_path: "/admin/panel?tab=channels",
    return_mode: "popup",
    whatsapp_onboarding_mode: "cloud_api",
    whatsapp_attempt_id: "attempt-a"
  }, 1000);
  assert.strictEqual(readOAuthState(stateSecret, popupState, 2000).return_mode, "popup");
  assert.strictEqual(readOAuthState(stateSecret, popupState, 2000).whatsapp_onboarding_mode, "cloud_api");
  assert.strictEqual(readOAuthState(stateSecret, popupState, 2000).whatsapp_attempt_id, "attempt-a");
  assert.strictEqual(readOAuthState(stateSecret, popupState, 30 * 60 * 1000).whatsapp_attempt_id, "attempt-a");
  assert.strictEqual(readOAuthState(stateSecret, popupState, 61 * 60 * 1000), null);
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
  assert(waUrl.searchParams.get("scope").includes("whatsapp_business_messaging"));
  assert(!waUrl.searchParams.get("scope").split(",").includes("business_management"));
  assert(!waUrl.toString().includes("meta-app-secret"));
  const instagramUrl = new URL(meta.authorizationUrl("instagram", state));
  assert(instagramUrl.searchParams.get("scope").includes("instagram_manage_messages"));
  assert(instagramUrl.searchParams.get("scope").includes("business_management"));

  const profileRequests = [];
  const profileAxios = async function (request) {
    profileRequests.push(request);
    assert.strictEqual(request.headers.Authorization, "Bearer profile-token");
    assert(!request.url.includes("profile-token"));
    if (request.url.endsWith("/v25.0/profile-app/uploads")) {
      assert.strictEqual(request.method, "POST");
      assert.strictEqual(request.params.file_type, "image/jpeg");
      assert.strictEqual(request.params.file_length, 4);
      return { data: { id: "upload:profile-session?sig=safe-signature" } };
    }
    if (request.url.includes("/v25.0/upload:profile-session?sig=safe-signature")) {
      assert.strictEqual(request.method, "POST");
      assert.strictEqual(request.headers.file_offset, "0");
      assert(Buffer.isBuffer(request.data));
      return { data: { h: "profile-picture-handle" } };
    }
    if (request.url.endsWith("/v25.0/profile-phone/whatsapp_business_profile") && request.method === "POST") {
      assert.strictEqual(request.data.messaging_product, "whatsapp");
      assert.strictEqual(request.data.profile_picture_handle, "profile-picture-handle");
      assert.strictEqual(request.data.description, "Perfil comercial RAV");
      assert.strictEqual(request.data.address, "Medellín, Colombia");
      return { data: { success: true } };
    }
    if (request.url.endsWith("/v25.0/profile-phone/whatsapp_business_profile")) {
      assert.strictEqual(request.params.fields, "profile_picture_url,description,address");
      return { data: { data: [{ business_profile: {
        profile_picture_url: "https://lookaside.example/profile.jpg",
        description: "Perfil comercial RAV",
        address: "Medellín, Colombia"
      } }] } };
    }
    throw new Error("Unexpected profile request: " + request.url);
  };
  const profileMeta = new MetaChannelProvider({
    appId: "profile-app",
    appSecret: "profile-secret",
    graphVersion: "v25.0",
    redirectUri: "https://nextforia.com/admin/channel-connections/meta/callback",
    axiosClient: profileAxios
  });
  const profileResult = await profileMeta.updateWhatsAppBusinessProfile({
    phone_number_id: "profile-phone",
    access_token: "profile-token"
  }, {
    image: { mime_type: "image/jpeg", bytes: Buffer.from([1, 2, 3, 4]) },
    description: "Perfil comercial RAV",
    address: "Medellín, Colombia"
  });
  assert.strictEqual(profileResult.ok, true);
  assert.strictEqual(profileResult.profile_verified, true);
  assert.strictEqual(profileResult.picture_present, true);
  assert.strictEqual(profileResult.description_applied, true);
  assert.strictEqual(profileResult.address_applied, true);
  assert.strictEqual(profileRequests.length, 4);

  const textProfileRequests = [];
  const textProfileMeta = new MetaChannelProvider({
    appId: "profile-app",
    appSecret: "profile-secret",
    graphVersion: "v25.0",
    redirectUri: "https://nextforia.com/admin/channel-connections/meta/callback",
    axiosClient: async function (request) {
      textProfileRequests.push(request);
      assert(!request.url.includes("/uploads"), "text-only profile changes must not create an upload session");
      if (request.method === "POST") {
        assert.deepStrictEqual(request.data, {
          messaging_product: "whatsapp",
          description: "Nueva descripción",
          address: "Nueva dirección"
        });
        return { data: { success: true } };
      }
      return { data: { data: [{ business_profile: {
        description: "Nueva descripción",
        address: "Nueva dirección"
      } }] } };
    }
  });
  const textProfileResult = await textProfileMeta.updateWhatsAppBusinessProfile({
    phone_number_id: "profile-phone",
    access_token: "profile-token"
  }, {
    description: "Nueva descripción",
    address: "Nueva dirección"
  });
  assert.strictEqual(textProfileResult.profile_verified, true);
  assert.strictEqual(textProfileResult.picture_present, false);
  assert.strictEqual(textProfileRequests.length, 2);

  const embeddedExchangeRequests = [];
  const embeddedExchangeAxios = async function (request) {
    embeddedExchangeRequests.push(request);
    if (request.url.endsWith("/v25.0/waba-coexistence/phone_numbers")) {
      return { data: { data: [{
        id: "phone-coexistence",
        display_phone_number: "+57 310 6534553",
        verified_name: "NextforIA",
        is_on_biz_app: true,
        status: "CONNECTED",
        platform_type: "CLOUD_API"
      }] } };
    }
    if (request.url.endsWith("/v25.0/waba-embedded/phone_numbers")) {
      return { data: { data: [{
        id: "phone-embedded",
        display_phone_number: "+57 310 6534553",
        verified_name: "NextforIA",
        is_on_biz_app: false,
        status: "UNREGISTERED",
        platform_type: "CLOUD_API"
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
    business_id: "business-embedded",
    onboarding_mode: "cloud_api"
  }, {
    redirectUri: "https://nextforia.com/admin/channel-connections/meta/callback"
  });
  assert.strictEqual(embeddedCandidate.phone_number_id, "phone-embedded");
  assert.strictEqual(embeddedCandidate.access_token, "embedded-access-token");
  assert.strictEqual(embeddedCandidate.coexistence, false);
  const embeddedWabaOnlyCandidate = await embeddedExchangeMeta.prepareEmbeddedWhatsApp("embedded-code", {
    waba_id: "waba-embedded",
    business_id: "business-embedded",
    onboarding_mode: "cloud_api",
    onboarding_event: "FINISH_ONLY_WABA"
  });
  assert.strictEqual(embeddedWabaOnlyCandidate.phone_number_id, "phone-embedded");
  assert.strictEqual(embeddedWabaOnlyCandidate.whatsapp_business_account_id, "waba-embedded");
  const embeddedCoexistenceCandidate = await embeddedExchangeMeta.prepareEmbeddedWhatsApp("embedded-code", {
    waba_id: "waba-coexistence",
    phone_number_id: "phone-coexistence",
    business_id: "business-coexistence",
    onboarding_mode: "coexistence",
    onboarding_event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
    coexistence: true,
    is_wa_login_user: true
  });
  assert.strictEqual(embeddedCoexistenceCandidate.phone_number_id, "phone-coexistence");
  assert.strictEqual(embeddedCoexistenceCandidate.onboarding_mode, "coexistence");
  assert.strictEqual(embeddedCoexistenceCandidate.coexistence, true);
  assert.strictEqual(embeddedCoexistenceCandidate.coexistence_event_confirmed, true);
  const embeddedRecoveryCandidate = await embeddedExchangeMeta.prepareEmbeddedWhatsApp("embedded-code", {
    waba_id: "waba-coexistence",
    phone_number_id: "phone-coexistence",
    business_id: "business-coexistence",
    onboarding_mode: "coexistence_recovery",
    onboarding_event: "FINISH_GRANT_ONLY_API_ACCESS",
    app_only_install: true
  });
  assert.strictEqual(embeddedRecoveryCandidate.phone_number_id, "phone-coexistence");
  assert.strictEqual(embeddedRecoveryCandidate.onboarding_mode, "coexistence_recovery");
  assert.strictEqual(embeddedRecoveryCandidate.coexistence, true);
  assert.strictEqual(embeddedRecoveryCandidate.coexistence_event_confirmed, true);
  await expectCode(embeddedExchangeMeta.prepareEmbeddedWhatsApp("embedded-code", {
    waba_id: "waba-coexistence",
    phone_number_id: "phone-coexistence",
    onboarding_mode: "coexistence_recovery",
    onboarding_event: "FINISH"
  }), "whatsapp_coexistence_event_required");
  await expectCode(embeddedExchangeMeta.prepareEmbeddedWhatsApp("embedded-code", {
    waba_id: "waba-embedded",
    business_id: "business-embedded",
    onboarding_mode: "coexistence",
    onboarding_event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"
  }), "whatsapp_coexistence_number_required");
  await expectCode(embeddedExchangeMeta.prepareEmbeddedWhatsApp("embedded-code", {
    waba_id: "waba-coexistence",
    phone_number_id: "phone-coexistence",
    onboarding_mode: "cloud_api",
    onboarding_event: "FINISH"
  }), "whatsapp_onboarding_mode_mismatch");
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
  let standardPhoneRegistered = false;
  const activationMeta = new MetaChannelProvider({
    appId: "123456789",
    appSecret: "meta-app-secret",
    whatsappConfigId: "wa-config-123",
    graphVersion: "v25.0",
    redirectUri: "https://nextforia.com/admin/channel-connections/meta/callback",
    axiosClient: async function (request) {
      activationRequests.push(request);
      if (request.url.endsWith("/phone-rav/register")) standardPhoneRegistered = true;
      return {
        data: request.url.endsWith("/ig-rav")
          ? { id: "ig-rav", username: "ravtoys", name: "RAV Toys" }
          : request.url.endsWith("/phone-rav")
            ? {
                id: "phone-rav",
                display_phone_number: "+57 301 587 2708",
                status: standardPhoneRegistered ? "CONNECTED" : "UNREGISTERED",
                code_verification_status: "VERIFIED",
                platform_type: standardPhoneRegistered ? "CLOUD_API" : "NOT_APPLICABLE",
                is_on_biz_app: false
              }
            : request.url.endsWith("/phone-coexistence")
              ? {
                id: "phone-coexistence",
                display_phone_number: "+57 301 587 2708",
                status: "CONNECTED",
                code_verification_status: "VERIFIED",
                platform_type: "CLOUD_API",
                is_on_biz_app: true
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
  await expectCode(activationMeta.activate("whatsapp", {
    whatsapp_business_account_id: "waba-rav",
    phone_number_id: "phone-rav",
    account_label: "+57 301 587 2708",
    access_token: "whatsapp-access-token",
    onboarding_mode: "cloud_api",
    registration_pin: "246810"
  }), "whatsapp_activation_retired");
  assert.strictEqual(activationRequests.length, 0, "legacy activation must not call Meta");
  await activationMeta.registerWhatsApp({
    phone_number_id: "phone-rav",
    access_token: "whatsapp-access-token",
    registration_pin: "246810"
  });
  assert(activationRequests[0].url.endsWith("/phone-rav/register"));
  assert.strictEqual(activationRequests[0].method, "POST");
  assert.strictEqual(activationRequests[0].data.messaging_product, "whatsapp");
  assert.strictEqual(activationRequests[0].data.pin, "246810");
  assert(!JSON.stringify(activationRequests).includes("meta-app-secret"));

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
    await failedRegistrationMeta.registerWhatsApp({
      phone_number_id: "phone-failed",
      access_token: "never-log-this-token",
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
          status: "CONNECTED",
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

  const inspectedWhatsApp = await currentWhatsAppSubscriptionShape.inspectWhatsApp({
    whatsapp_business_account_id: "waba-rav",
    phone_number_id: "phone-rav",
    access_token: "whatsapp-access-token"
  });
  assert.strictEqual(inspectedWhatsApp.ok, true);
  assert.strictEqual(inspectedWhatsApp.registration_ready, true);
  assert.strictEqual(inspectedWhatsApp.app_subscribed, true);
  assert.strictEqual(inspectedWhatsApp.detected_mode, "cloud_api");
  assert(!JSON.stringify(inspectedWhatsApp).includes("whatsapp-access-token"));

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

  const profileSyncStore = new InMemoryChannelConnectionStore();
  await profileSyncStore.upsert({
    tenant_id: "tenant-profile",
    channel: "whatsapp",
    status: "connected",
    webhook_status: "subscribed",
    phone_number_id: "profile-phone",
    credentials_ciphertext: encryptStoredText(JSON.stringify({
      phone_number_id: "profile-phone",
      access_token: "profile-token"
    }), encryptionKey)
  });
  let syncedProfileImage = null;
  const profileSyncService = createChannelConnectionService({
    store: profileSyncStore,
    provider: {
      updateWhatsAppBusinessProfile: async function (credential, input) {
        assert.strictEqual(credential.phone_number_id, "profile-phone");
        assert.strictEqual(credential.access_token, "profile-token");
        syncedProfileImage = input.image;
        assert.strictEqual(input.description, "Perfil de tenant");
        assert.strictEqual(input.address, "Calle del tenant");
        return {
          ok: true,
          profile_verified: true,
          picture_present: true,
          description_applied: true,
          address_applied: true,
          phone_number_suffix: "le-phone"
        };
      }
    },
    encryptionKey
  });
  const syncedProfile = await profileSyncService.syncWhatsAppBusinessProfile("tenant-profile", {
    avatar_url: "data:image/jpeg;base64," + Buffer.from("profile-image").toString("base64"),
    description: "Perfil de tenant",
    address: "Calle del tenant"
  }, "owner@profile.example");
  assert.strictEqual(syncedProfile.status, "applied");
  assert.strictEqual(syncedProfile.profile_verified, true);
  assert.strictEqual(syncedProfile.picture_present, true);
  assert.strictEqual(syncedProfile.description_applied, true);
  assert.strictEqual(syncedProfile.address_applied, true);
  assert.strictEqual(syncedProfileImage.mime_type, "image/jpeg");
  assert.strictEqual(syncedProfileImage.bytes.toString(), "profile-image");
  await expectCode(profileSyncService.syncWhatsAppBusinessProfile("tenant-missing", {
    avatar_url: "data:image/jpeg;base64," + Buffer.from("profile-image").toString("base64")
  }, "owner@profile.example"), "whatsapp_profile_not_connected");

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

  const billingStore = new InMemoryChannelConnectionStore();
  const billingCredential = encryptStoredText(JSON.stringify({
    access_token: "billing-test-token",
    phone_number_id: "phone-b",
    whatsapp_business_account_id: "waba-b"
  }), encryptionKey);
  await billingStore.upsert({
    tenant_id: "tenant-a",
    channel: "whatsapp",
    status: "connected",
    webhook_status: "subscribed",
    phone_number_id: "phone-a",
    whatsapp_business_account_id: "waba-a",
    connected_at: "2026-08-08T12:00:00.000Z",
    last_verified_at: "2026-08-08T12:30:00.000Z",
    updated_at: "2026-08-08T12:30:00.000Z",
    credentials_ciphertext: billingCredential
  });
  await billingStore.upsert({
    tenant_id: "tenant-b",
    channel: "whatsapp",
    status: "connected",
    webhook_status: "subscribed",
    phone_number_id: "phone-b",
    whatsapp_business_account_id: "waba-b",
    connected_at: "2026-08-08T12:00:00.000Z",
    last_verified_at: "2026-08-08T12:30:00.000Z",
    updated_at: "2026-08-08T12:30:00.000Z",
    credentials_ciphertext: billingCredential
  });
  const billingService = createChannelConnectionService({
    store: billingStore,
    provider: {
      configured: function () { return true; },
      verify: async function () { return { ok: true, account_label: "+57 310 000 0000" }; }
    },
    encryptionKey,
    now: function () { return new Date("2026-08-08T14:00:00.000Z"); }
  });
  const failedBilling = await billingService.recordWhatsAppDeliveryStatus("tenant-b", "phone-b", {
    id: "wamid.billing-failed",
    status: "failed",
    timestamp: String(Date.parse("2026-08-08T13:00:00.000Z") / 1000),
    errors: [{ code: 131042 }]
  }, "system:meta-webhook");
  assert.strictEqual(failedBilling.updated, true);
  assert.strictEqual(failedBilling.outbound_billing_blocked, true);
  assert.strictEqual(failedBilling.connection.status, "needs_attention");
  assert.strictEqual(failedBilling.connection.outbound_billing_blocked, true);
  assert.match(failedBilling.connection.activation_message, /método de pago válido/i);
  assert.strictEqual((await billingStore.get("tenant-b", "whatsapp")).status, "connected",
    "durable routing remains connected so inbound webhooks keep reaching the tenant");
  assert.strictEqual((await billingStore.get("tenant-b", "whatsapp")).webhook_status, "outbound_billing_blocked");
  assert.strictEqual(
    (await billingStore.get("tenant-b", "whatsapp")).whatsapp_outbound_billing_status_at,
    "2026-08-08T13:00:00.000Z",
    "the failure timestamp is the durable billing-status watermark"
  );
  assert.strictEqual((await billingStore.get("tenant-a", "whatsapp")).webhook_status, "subscribed",
    "tenant B billing failures must never affect tenant A");

  const readOnlyCheck = await billingService.verify("tenant-b", "whatsapp", "owner@tenant-b.example");
  assert.strictEqual(readOnlyCheck.status, "needs_attention", "read-only Meta verification cannot clear billing");
  assert.strictEqual((await billingStore.get("tenant-b", "whatsapp")).webhook_status, "outbound_billing_blocked");

  await billingService.recordWhatsAppDeliveryStatus("tenant-b", "phone-b", {
    id: "wamid.old-delivery",
    status: "delivered",
    timestamp: String(Date.parse("2026-08-08T12:59:59.000Z") / 1000)
  }, "system:meta-webhook");
  assert.strictEqual((await billingStore.get("tenant-b", "whatsapp")).webhook_status, "outbound_billing_blocked",
    "out-of-order delivery evidence older than the failure cannot recover the connection");

  await billingService.recordWhatsAppDeliveryStatus("tenant-a", "phone-b", {
    id: "wamid.wrong-tenant",
    status: "delivered",
    timestamp: String(Date.parse("2026-08-08T13:05:00.000Z") / 1000)
  }, "system:meta-webhook");
  assert.strictEqual((await billingStore.get("tenant-a", "whatsapp")).webhook_status, "subscribed");
  assert.strictEqual((await billingStore.get("tenant-b", "whatsapp")).webhook_status, "outbound_billing_blocked");

  const recoveredBilling = await billingService.recordWhatsAppDeliveryStatus("tenant-b", "phone-b", {
    id: "wamid.new-delivery",
    status: "delivered",
    timestamp: String(Date.parse("2026-08-08T13:05:00.000Z") / 1000)
  }, "system:meta-webhook");
  assert.strictEqual(recoveredBilling.updated, true);
  assert.strictEqual(recoveredBilling.outbound_billing_blocked, false);
  assert.strictEqual(recoveredBilling.connection.status, "connected");
  assert.strictEqual((await billingStore.get("tenant-b", "whatsapp")).webhook_status, "subscribed");
  assert.strictEqual(
    (await billingStore.get("tenant-b", "whatsapp")).whatsapp_outbound_billing_status_at,
    "2026-08-08T13:05:00.000Z"
  );
  const lateBillingFailure = await billingService.recordWhatsAppDeliveryStatus("tenant-b", "phone-b", {
    id: "wamid.late-billing-failed",
    status: "failed",
    timestamp: String(Date.parse("2026-08-08T13:00:00.000Z") / 1000),
    errors: [{ code: 131042 }]
  }, "system:meta-webhook");
  assert.strictEqual(lateBillingFailure.updated, false,
    "a late failure at or below the durable watermark must be ignored");
  assert.strictEqual(lateBillingFailure.outbound_billing_blocked, false);
  assert.strictEqual((await billingStore.get("tenant-b", "whatsapp")).webhook_status, "subscribed");
  assert.strictEqual(
    (await billingStore.get("tenant-b", "whatsapp")).whatsapp_outbound_billing_status_at,
    "2026-08-08T13:05:00.000Z"
  );
  const equalTimestampDelivery = await billingService.recordWhatsAppDeliveryStatus("tenant-a", "phone-a", {
    id: "wamid.equal-time-delivery",
    status: "delivered",
    timestamp: String(Date.parse("2026-08-08T13:10:00.000Z") / 1000)
  }, "system:meta-webhook");
  assert.strictEqual(equalTimestampDelivery.updated, true);
  assert.strictEqual(equalTimestampDelivery.outbound_billing_blocked, false);
  const equalTimestampFailure = await billingService.recordWhatsAppDeliveryStatus("tenant-a", "phone-a", {
    id: "wamid.equal-time-failure",
    status: "failed",
    timestamp: String(Date.parse("2026-08-08T13:10:00.000Z") / 1000),
    errors: [{ code: 131042 }]
  }, "system:meta-webhook");
  assert.strictEqual(equalTimestampFailure.updated, true,
    "a 131042 failure must win when it has the same Meta timestamp as delivered evidence");
  assert.strictEqual(equalTimestampFailure.outbound_billing_blocked, true);
  assert.strictEqual((await billingStore.get("tenant-a", "whatsapp")).webhook_status,
    "outbound_billing_blocked");
  assert.strictEqual(
    (await billingStore.get("tenant-a", "whatsapp")).whatsapp_outbound_billing_status_at,
    "2026-08-08T13:10:00.000Z"
  );
  assert(billingStore.audit.some(function (event) { return event.action === "whatsapp_outbound_billing_blocked"; }));
  assert(billingStore.audit.some(function (event) { return event.action === "whatsapp_outbound_billing_recovered"; }));

  let casCurrent = {
    tenant_id: "tenant-cas",
    channel: "whatsapp",
    status: "connected",
    webhook_status: "subscribed",
    phone_number_id: "phone-cas",
    connected_at: "2026-08-08T12:00:00.000Z",
    updated_at: "2026-08-08T12:30:00.000Z"
  };
  let casPatchCalls = 0;
  const casAxios = {
    get: async function () { return { data: [Object.assign({}, casCurrent)] }; },
    patch: async function (_, body, options) {
      casPatchCalls++;
      if (casPatchCalls === 1) {
        casCurrent.updated_at = "2026-08-08T12:45:00.000Z";
        return { data: [] };
      }
      assert.strictEqual(options.params.updated_at, "eq." + casCurrent.updated_at);
      casCurrent = Object.assign({}, casCurrent, body);
      return { data: [Object.assign({}, casCurrent)] };
    },
    post: async function () { return { data: null }; }
  };
  const casStore = new SupabaseChannelConnectionStore({
    url: "https://supabase.example",
    headers: { apikey: "test" },
    axiosClient: casAxios
  });
  const casResult = await casStore.markWhatsAppOutboundBillingBlocked("tenant-cas", "phone-cas", {
    occurred_at: "2026-08-08T13:00:00.000Z",
    updated_at: "2026-08-08T14:00:00.000Z"
  }, { action: "whatsapp_outbound_billing_blocked", actor: "test" });
  assert.strictEqual(casResult.updated, true);
  assert.strictEqual(casPatchCalls, 2, "a bounded CAS retry must survive one concurrent row update");
  assert.strictEqual(casCurrent.whatsapp_outbound_billing_status_at, "2026-08-08T13:00:00.000Z");
  const casRecovery = await casStore.clearWhatsAppOutboundBillingBlocked("tenant-cas", "phone-cas", {
    occurred_at: "2026-08-08T13:05:00.000Z",
    updated_at: "2026-08-08T14:05:00.000Z"
  }, { action: "whatsapp_outbound_billing_recovered", actor: "test" });
  assert.strictEqual(casRecovery.updated, true);
  assert.strictEqual(casCurrent.webhook_status, "subscribed");
  assert.strictEqual(casCurrent.whatsapp_outbound_billing_status_at, "2026-08-08T13:05:00.000Z");
  const casPatchCallsBeforeLateFailure = casPatchCalls;
  const casLateFailure = await casStore.markWhatsAppOutboundBillingBlocked("tenant-cas", "phone-cas", {
    occurred_at: "2026-08-08T13:00:00.000Z",
    updated_at: "2026-08-08T14:10:00.000Z"
  }, { action: "whatsapp_outbound_billing_blocked", actor: "test" });
  assert.strictEqual(casLateFailure.updated, false);
  assert.strictEqual(casPatchCalls, casPatchCallsBeforeLateFailure,
    "the Supabase adapter must reject a stale failure before issuing a CAS write");
  assert.strictEqual(casCurrent.webhook_status, "subscribed");
  assert.strictEqual(casCurrent.whatsapp_outbound_billing_status_at, "2026-08-08T13:05:00.000Z");
  const casEqualDelivery = await casStore.clearWhatsAppOutboundBillingBlocked("tenant-cas", "phone-cas", {
    occurred_at: "2026-08-08T13:15:00.000Z",
    updated_at: "2026-08-08T14:15:00.000Z"
  }, { action: "whatsapp_outbound_billing_recovered", actor: "test" });
  assert.strictEqual(casEqualDelivery.updated, true);
  assert.strictEqual(casCurrent.webhook_status, "subscribed");
  assert.strictEqual(casCurrent.whatsapp_outbound_billing_status_at, "2026-08-08T13:15:00.000Z");
  const casEqualFailure = await casStore.markWhatsAppOutboundBillingBlocked("tenant-cas", "phone-cas", {
    occurred_at: "2026-08-08T13:15:00.000Z",
    updated_at: "2026-08-08T14:15:01.000Z"
  }, { action: "whatsapp_outbound_billing_blocked", actor: "test" });
  assert.strictEqual(casEqualFailure.updated, true,
    "the Supabase CAS must let a same-timestamp 131042 failure win over delivered");
  assert.strictEqual(casCurrent.webhook_status, "outbound_billing_blocked");
  assert.strictEqual(casCurrent.whatsapp_outbound_billing_status_at, "2026-08-08T13:15:00.000Z");
  const casPatchCallsBeforeDuplicateFailure = casPatchCalls;
  const casDuplicateFailure = await casStore.markWhatsAppOutboundBillingBlocked("tenant-cas", "phone-cas", {
    occurred_at: "2026-08-08T13:15:00.000Z",
    updated_at: "2026-08-08T14:15:02.000Z"
  }, { action: "whatsapp_outbound_billing_blocked", actor: "test" });
  assert.strictEqual(casDuplicateFailure.updated, false,
    "the same failure is idempotent once the connection is already blocked");
  assert.strictEqual(casPatchCalls, casPatchCallsBeforeDuplicateFailure);

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
  await expectCode(legacyService.begin("rav-toys", "whatsapp", "super-admin", state, {
    attemptId: "attempt-active-rav"
  }), "active_connection_must_be_disconnected");

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
  const optedInUrl = await optedInLegacyService.begin("rav-toys", "whatsapp", "super-admin", state, {
    attemptId: "attempt-opted-in-rav"
  });
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
