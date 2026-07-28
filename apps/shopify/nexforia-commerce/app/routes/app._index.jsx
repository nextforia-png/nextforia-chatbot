/* eslint-env node */

import { Form, useActionData, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  NEXFORIA_CAPABILITIES,
  searchProducts,
} from "../lib/commerce.server";
import {
  pairingErrorMessage,
  verifyPairingToken,
} from "../lib/pairing.server";
import {
  confirmPairingWithBackend,
  loadPairingFromBackend,
} from "../lib/remote-session-storage.server";

async function pairShopToBot(session, pairingToken) {
  const verified = verifyPairingToken(pairingToken);
  if (verified.shop && verified.shop !== session.shop) {
    const error = new Error("pairing_shop_mismatch");
    error.code = "pairing_shop_mismatch";
    throw error;
  }
  const pairing = await confirmPairingWithBackend({
    baseUrl: process.env.NEXFORIA_BACKEND_URL,
    secret: process.env.NEXFORIA_COMMERCE_SERVICE_SECRET,
    pairingToken,
    shop: session.shop,
  });

  return {
    tenantId: pairing.tenant_id,
    botId: pairing.bot_id,
  };
}

function pairingTokenFromRequest(request) {
  const url = new URL(request.url);
  const direct = String(url.searchParams.get("pairing_token") || "").trim();
  if (direct) return direct;
  const match = String(request.headers.get("cookie") || "").match(
    /(?:^|;\s*)nexforia_pairing=([^;]+)/,
  );
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return "";
  }
}

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  let catalogStatus = "Connected";
  let catalogMessage = "Shopify accepted a live catalog query.";
  let pairingNotice = null;
  const pairingToken = pairingTokenFromRequest(request);
  if (pairingToken) {
    try {
      const pairing = await pairShopToBot(session, pairingToken);
      pairingNotice = `Store connected to NexforIA bot ${pairing.botId}.`;
    } catch (error) {
      pairingNotice = pairingErrorMessage(error);
    }
  }
  let pairing = null;
  try {
    pairing = await loadPairingFromBackend({
      baseUrl: process.env.NEXFORIA_BACKEND_URL,
      secret: process.env.NEXFORIA_COMMERCE_SERVICE_SECRET,
      shop: session.shop,
    });
  } catch (error) {
    pairingNotice = pairingNotice || pairingErrorMessage(error);
  }

  try {
    await searchProducts(admin, "status:active", { limit: 1 });
  } catch (error) {
    catalogStatus = "Needs attention";
    catalogMessage = error instanceof Error ? error.message : "Catalog query failed";
  }

  return {
    shop: session.shop,
    grantedScopes: String(session.scope || "")
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean),
    capabilities: NEXFORIA_CAPABILITIES,
    catalogStatus,
    catalogMessage,
    pairing: pairing
      ? {
          tenantId: pairing.tenant_id,
          botId: pairing.bot_id,
          status: pairing.status,
          pairedAt: pairing.connected_at,
        }
      : null,
    pairingToken,
    pairingNotice,
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const pairingToken = String(formData.get("pairingToken") || "").trim();

  try {
    const pairing = await pairShopToBot(session, pairingToken);

    return {
      status: "success",
      message: "Store connected to the NexforIA bot.",
      pairing,
    };
  } catch (error) {
    return {
      status: "error",
      message: pairingErrorMessage(error),
    };
  }
};

export default function Index() {
  const {
    shop,
    grantedScopes,
    capabilities,
    catalogStatus,
    catalogMessage,
    pairing,
    pairingToken,
    pairingNotice,
  } = useLoaderData();
  const actionData = useActionData();

  const enabledCapabilities = Object.entries(capabilities)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name.replaceAll("_", " "));

  return (
    <s-page heading="NexforIA Commerce">
      <s-section heading="Shopify connection">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Store: <s-text>{shop}</s-text>
          </s-paragraph>
          <s-paragraph>
            Catalog: <s-text>{catalogStatus}</s-text>
          </s-paragraph>
          <s-paragraph>{catalogMessage}</s-paragraph>
        </s-stack>
      </s-section>

      <s-section heading="NexforIA bot pairing">
        <s-stack direction="block" gap="base">
          {pairing ? (
            <>
              <s-paragraph>
                Connected bot: <s-text>{pairing.botId}</s-text>
              </s-paragraph>
              <s-paragraph>
                Tenant: <s-text>{pairing.tenantId}</s-text>
              </s-paragraph>
            </>
          ) : (
            <s-paragraph>
              Paste the pairing code from NexforIA to connect this store to the
              customer bot.
            </s-paragraph>
          )}
          {pairingNotice || actionData?.message ? (
            <s-paragraph>{pairingNotice || actionData.message}</s-paragraph>
          ) : null}
          <Form method="post">
            <s-stack direction="block" gap="base">
              <s-text-field
                label="Pairing code"
                name="pairingToken"
                defaultValue={pairingToken}
                autocomplete="off"
              />
              <s-button variant="primary" submit>
                Connect bot
              </s-button>
            </s-stack>
          </Form>
        </s-stack>
      </s-section>

      <s-section heading="Bot capabilities">
        <s-paragraph>
          This installation prepares NexforIA to search products, check stock,
          and validate order status without editing store data.
        </s-paragraph>
        <s-unordered-list>
          {enabledCapabilities.map((capability) => (
            <s-list-item key={capability}>{capability}</s-list-item>
          ))}
        </s-unordered-list>
      </s-section>

      <s-section heading="Permissions">
        <s-paragraph>
          Granted scopes: {grantedScopes.join(", ") || "Waiting for install"}
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Next step">
        <s-paragraph>
          {pairing
            ? "Test product search and order tracking from the NexforIA bot dashboard."
            : "Create a pairing code in NexforIA, then connect this store."}
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
