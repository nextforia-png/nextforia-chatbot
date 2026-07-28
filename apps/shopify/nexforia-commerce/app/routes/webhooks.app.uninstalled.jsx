import { authenticate, sessionStorage } from "../shopify.server";

export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  const sessions = await sessionStorage.findSessionsByShop(shop);
  await sessionStorage.deleteSessions(sessions.map((stored) => stored.id));

  return new Response();
};
