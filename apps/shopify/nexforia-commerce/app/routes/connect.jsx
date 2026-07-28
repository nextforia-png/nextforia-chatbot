import { redirect } from "react-router";
import { pairingTokenFromCookie } from "../lib/pairing-cookie.server";
import { preparePairingWithBackend } from "../lib/remote-session-storage.server";

function cleanShopifyShop(value) {
  const shop = String(value || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop) ? shop : "";
}

export const action = async ({ request }) => {
  const form = await request.formData();
  const shop = cleanShopifyShop(form.get("shop"));
  const pairingToken = pairingTokenFromCookie(request.headers.get("cookie"));

  if (!shop) {
    throw redirect("/?error=invalid_shop");
  }
  if (!pairingToken) {
    throw redirect("/?error=missing_pairing");
  }

  try {
    await preparePairingWithBackend({
      baseUrl: process.env.NEXFORIA_BACKEND_URL,
      secret: process.env.NEXFORIA_COMMERCE_SERVICE_SECRET,
      pairingToken,
      shop,
    });
  } catch (error) {
    const code = encodeURIComponent(error?.message || "pairing_unavailable");
    throw redirect(`/?error=${code}`);
  }

  throw redirect(`/auth/login?shop=${encodeURIComponent(shop)}`);
};

export const loader = async () => {
  throw redirect("/");
};
