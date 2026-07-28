/* eslint-env node */

import { useLoaderData } from "react-router";
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
import { pairingTokenFromCookie } from "../lib/pairing-cookie.server";
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
  return pairingTokenFromCookie(request.headers.get("cookie"));
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
    pairingNotice,
  };
};

export default function Index() {
  const {
    shop,
    grantedScopes,
    capabilities,
    catalogStatus,
    catalogMessage,
    pairing,
    pairingNotice,
  } = useLoaderData();

  const enabledCapabilities = Object.entries(capabilities)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name.replaceAll("_", " "));

  return (
    <s-page heading="Nextfor IA · Shopify">
      <s-banner tone={pairing ? "success" : "info"}>
        {pairing
          ? "Tu tienda ya está conectada con Nextfor."
          : "Autoriza Shopify y Nextfor completará la conexión automáticamente."}
      </s-banner>

      <s-section heading="Tu tienda">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Tienda: <s-text>{shop}</s-text>
          </s-paragraph>
          <s-paragraph>
            Catálogo: <s-text>{catalogStatus === "Connected" ? "Conectado" : "Requiere revisión"}</s-text>
          </s-paragraph>
          <s-paragraph>
            {catalogStatus === "Connected"
              ? "Shopify confirmó el acceso seguro al catálogo."
              : catalogMessage}
          </s-paragraph>
        </s-stack>
      </s-section>

      <s-section heading="Conexión con tu agente">
        <s-stack direction="block" gap="base">
          {pairing ? (
            <>
              <s-paragraph>
                Estado: <s-text>Conectado</s-text>
              </s-paragraph>
              <s-paragraph>
                Nextfor ya puede usar el catálogo y consultar pedidos de esta
                tienda para atender a tus clientes.
              </s-paragraph>
            </>
          ) : (
            <s-paragraph>
              No necesitas copiar ni solicitar ningún código. Vuelve a Nextfor
              y usa el botón “Conectar Shopify” para iniciar una conexión nueva
              y segura.
            </s-paragraph>
          )}
          {pairingNotice ? (
            <s-paragraph>{pairingNotice}</s-paragraph>
          ) : null}
          <s-link href="https://nextforia.com/admin/panel?tab=channels" target="_top">
            {pairing ? "Volver al Customer Panel" : "Volver a Nextfor y reintentar"}
          </s-link>
        </s-stack>
      </s-section>

      <s-section heading="Qué queda habilitado">
        <s-paragraph>
          Esta instalación permite consultar productos, disponibilidad y estado
          de pedidos sin editar información de tu tienda.
        </s-paragraph>
        <s-unordered-list>
          {enabledCapabilities.map((capability) => (
            <s-list-item key={capability}>{capability}</s-list-item>
          ))}
        </s-unordered-list>
      </s-section>

      <s-section heading="Permisos">
        <s-paragraph>
          Permisos autorizados: {grantedScopes.join(", ") || "Esperando autorización"}
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Siguiente paso">
        <s-paragraph>
          {pairing
            ? "Regresa a Nextfor para continuar la activación de tu agente."
            : "Regresa al Customer Panel y vuelve a pulsar Conectar Shopify."}
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
