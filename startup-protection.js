"use strict";

const DISABLED_STARTUP_MUTATIONS = Object.freeze([
  "environment_channel_adoption",
  "meta_phone_registration",
  "meta_subscription_repair",
  "channel_owner_disconnect",
  "channel_credential_clear",
  "tenant_alias_application",
  "tenant_merge_or_reassignment",
  "pricing_catalog_sync",
  "customer_access_reset",
  "conversation_handoff_repair",
  "production_delivery_probe"
]);

function cleanText(value, max) {
  return String(value == null ? "" : value).trim().slice(0, max || 240);
}

function cleanTenantId(value) {
  return cleanText(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
}

function configuredOwnerHints(env) {
  const source = env || {};
  const registrationFlagPresent = Object.keys(source).some(function (key) {
    return /_WHATSAPP_REGISTER_(NOW|ON_BOOT)$/.test(key) && source[key] === "1";
  });
  let aliasCount = 0;
  let aliasesInvalid = false;
  if (cleanText(source.CHANNEL_CONNECTION_INTERNAL_TENANT_ALIASES, 20000)) {
    try {
      const parsed = JSON.parse(source.CHANNEL_CONNECTION_INTERNAL_TENANT_ALIASES);
      aliasCount = parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? Object.keys(parsed).length
        : 0;
    } catch (_) {
      aliasesInvalid = true;
    }
  }
  return {
    tenant_owner_hint_present: !!cleanTenantId(source.CHANNEL_CONNECTION_BOOTSTRAP_WHATSAPP_TENANT_ID),
    tenant_alias_count: aliasCount,
    tenant_aliases_invalid: aliasesInvalid,
    whatsapp_credential_present: !!(source.WA_TOKEN && source.PHONE_NUMBER_ID),
    instagram_credential_present: !!(source.IG_ACCESS_TOKEN && (source.IG_SEND_ID || source.IG_USER_ID)),
    messenger_credential_present: !!((source.MESSENGER_PAGE_ACCESS_TOKEN || source.FB_PAGE_ACCESS_TOKEN) &&
      (source.MESSENGER_PAGE_ID || source.FB_PAGE_ID)),
    phone_registration_requested: registrationFlagPresent,
    pricing_sync_requested: source.NEXTFOR_PRICING_SYNC_ON_BOOT !== "0",
    customer_access_reset_would_run: source.NODE_ENV === "production" || !!source.CUSTOMER_ACCESS_RESET_CUTOFF
  };
}

function assetKey(record) {
  const row = record || {};
  const channel = cleanText(row.channel, 40).toLowerCase();
  const assetId = channel === "whatsapp"
    ? row.phone_number_id || row.account_id
    : channel === "instagram"
      ? row.instagram_user_id || row.account_id
      : channel === "messenger" ? row.page_id || row.account_id : "";
  return channel && assetId ? channel + ":" + cleanText(assetId, 240) : "";
}

function inspectStoredConnections(rows) {
  const conflicts = [];
  const ownersByAsset = new Map();
  for (const record of Array.isArray(rows) ? rows : []) {
    if (!record || !["connecting", "connected", "needs_attention"].includes(record.status)) continue;
    const tenantId = cleanTenantId(record.tenant_id);
    const key = assetKey(record);
    if (!tenantId || !key) continue;
    if (!ownersByAsset.has(key)) ownersByAsset.set(key, new Set());
    ownersByAsset.get(key).add(tenantId);
    if (/^meta-app-review-[a-z0-9-]+$/.test(tenantId)) {
      conflicts.push({
        code: "temporary_review_owner_active",
        channel: cleanText(record.channel, 40),
        asset_suffix: key.slice(-8),
        decision: "pending_super_admin"
      });
    }
  }
  ownersByAsset.forEach(function (owners, key) {
    if (owners.size < 2) return;
    conflicts.push({
      code: "asset_has_multiple_tenant_owners",
      channel: key.split(":")[0],
      asset_suffix: key.slice(-8),
      owner_count: owners.size,
      decision: "pending_super_admin"
    });
  });
  return conflicts;
}

async function runStartupProtectionDiagnostics(options) {
  const settings = options || {};
  const store = settings.store;
  const logger = typeof settings.log === "function" ? settings.log : function () {};
  const hints = configuredOwnerHints(settings.env);
  const conflicts = [];
  let storedConnections = [];
  let storageReadable = !store;

  if (store && typeof store.listAll === "function") {
    try {
      storedConnections = await store.listAll();
      storageReadable = true;
      conflicts.push(...inspectStoredConnections(storedConnections));
    } catch (error) {
      conflicts.push({
        code: "connection_storage_unreadable",
        error: cleanText(error && error.message, 200),
        decision: "pending_super_admin"
      });
    }
  }

  if (hints.tenant_owner_hint_present || hints.tenant_alias_count || hints.tenant_aliases_invalid ||
      hints.whatsapp_credential_present || hints.instagram_credential_present || hints.messenger_credential_present ||
      hints.phone_registration_requested) {
    conflicts.push({
      code: "environment_channel_ownership_hints_ignored",
      alias_count: hints.tenant_alias_count,
      aliases_invalid: hints.tenant_aliases_invalid,
      channels_with_credentials: [
        hints.whatsapp_credential_present ? "whatsapp" : "",
        hints.instagram_credential_present ? "instagram" : "",
        hints.messenger_credential_present ? "messenger" : ""
      ].filter(Boolean),
      decision: "pending_super_admin"
    });
  }

  const result = {
    ok: storageReadable,
    mode: "read_only",
    skipped: false,
    inspected_connection_count: Array.isArray(storedConnections) ? storedConnections.length : 0,
    disabled_mutations: DISABLED_STARTUP_MUTATIONS.slice(),
    conflicts
  };
  logger(conflicts.length ? "warn" : "info", "startup_protection_diagnostic", {
    mode: result.mode,
    inspected_connection_count: result.inspected_connection_count,
    disabled_mutation_count: result.disabled_mutations.length,
    conflict_count: conflicts.length,
    conflicts
  });
  return result;
}

module.exports = {
  DISABLED_STARTUP_MUTATIONS,
  configuredOwnerHints,
  inspectStoredConnections,
  runStartupProtectionDiagnostics
};
