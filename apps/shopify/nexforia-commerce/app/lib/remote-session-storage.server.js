import { Session } from "@shopify/shopify-api";

function required(value, name) {
  const clean = String(value || "").trim();
  if (!clean) throw new Error(`${name}_required`);
  return clean;
}

export class RemoteSessionStorage {
  constructor(options = {}) {
    this.baseUrl = required(options.baseUrl, "backend_url").replace(/\/$/, "");
    this.secret = required(options.secret, "commerce_service_secret");
    this.fetch = options.fetchImpl || fetch;
  }

  async request(path, options = {}) {
    const response = await this.fetch(this.baseUrl + path, {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${this.secret}`,
        "Content-Type": "application/json"
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok !== true) {
      const error = new Error(payload.error || `backend_status_${response.status}`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  async storeSession(session) {
    await this.request("/internal/shopify/sessions", {
      method: "POST",
      body: { session: session.toPropertyArray(true) }
    });
    return true;
  }

  async loadSession(id) {
    try {
      const payload = await this.request(`/internal/shopify/sessions/${encodeURIComponent(id)}`);
      return Session.fromPropertyArray(payload.session, true);
    } catch (error) {
      if (error.status === 404) return undefined;
      throw error;
    }
  }

  async deleteSession(id) {
    await this.request(`/internal/shopify/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
    return true;
  }

  async deleteSessions(ids) {
    await this.request("/internal/shopify/sessions/delete", {
      method: "POST",
      body: { ids }
    });
    return true;
  }

  async findSessionsByShop(shop) {
    const payload = await this.request(
      `/internal/shopify/sessions/by-shop?shop=${encodeURIComponent(shop)}`
    );
    return (payload.sessions || []).map((entries) =>
      Session.fromPropertyArray(entries, true)
    );
  }
}

export async function confirmPairingWithBackend(options = {}) {
  const baseUrl = required(options.baseUrl, "backend_url").replace(/\/$/, "");
  const secret = required(options.secret, "commerce_service_secret");
  const response = await (options.fetchImpl || fetch)(
    baseUrl + "/internal/shopify/pairings",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        pairing_token: required(options.pairingToken, "pairing_token"),
        shop: required(options.shop, "shop")
      })
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) {
    const error = new Error(payload.error || `backend_status_${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

export async function loadPairingFromBackend(options = {}) {
  const baseUrl = required(options.baseUrl, "backend_url").replace(/\/$/, "");
  const secret = required(options.secret, "commerce_service_secret");
  const response = await (options.fetchImpl || fetch)(
    `${baseUrl}/internal/shopify/pairings/by-shop?shop=${encodeURIComponent(required(options.shop, "shop"))}`,
    {
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json"
      }
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) {
    const error = new Error(payload.error || `backend_status_${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload.pairing || null;
}
