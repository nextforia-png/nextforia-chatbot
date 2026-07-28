/* eslint-env node */

export const loader = async () => {
  const configured = Boolean(
    process.env.SHOPIFY_API_KEY &&
      process.env.SHOPIFY_API_SECRET &&
      process.env.SHOPIFY_APP_URL &&
      process.env.NEXFORIA_BACKEND_URL &&
      String(process.env.NEXFORIA_COMMERCE_SERVICE_SECRET || "").length >= 32
  );
  return Response.json(
    {
      ok: configured,
      service: "nexforia-commerce",
      status: configured ? "ready" : "configuration_required"
    },
    { status: configured ? 200 : 503 }
  );
};
