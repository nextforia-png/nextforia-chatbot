export const NEXFORIA_CAPABILITIES = Object.freeze({
  product_search: true,
  inventory_lookup: true,
  order_tracking: true,
  checkout_links: false,
  webhooks: false,
});

export const PRODUCT_SEARCH_QUERY = `#graphql
  query NexforIAProductSearch($query: String!, $first: Int!) {
    products(first: $first, query: $query) {
      nodes {
        id
        title
        handle
        onlineStoreUrl
        totalInventory
        featuredMedia {
          preview {
            image {
              url
              altText
            }
          }
        }
        priceRangeV2 {
          minVariantPrice {
            amount
            currencyCode
          }
        }
      }
    }
  }
`;

export const ORDER_STATUS_QUERY = `#graphql
  query NexforIAOrderStatus($query: String!) {
    orders(first: 5, query: $query, sortKey: CREATED_AT, reverse: true) {
      nodes {
        id
        name
        email
        phone
        createdAt
        displayFinancialStatus
        displayFulfillmentStatus
        billingAddress {
          name
          phone
          city
          province
          country
        }
        shippingAddress {
          name
          phone
          city
          province
          country
        }
        fulfillments(first: 10) {
          status
          displayStatus
          createdAt
          estimatedDeliveryAt
          trackingInfo(first: 10) {
            company
            number
            url
          }
        }
      }
    }
  }
`;

function graphQLErrors(payload) {
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  if (!errors.length) return null;
  return errors.map((error) => error.message || "Shopify GraphQL error").join("; ");
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningfulNameTokens(value) {
  const stopwords = new Set(["de", "del", "la", "las", "los", "y", "el", "al"]);
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length >= 2 && !stopwords.has(token));
}

function nameMatches(order, customerName) {
  const expected = normalizeText(customerName);
  const tokens = meaningfulNameTokens(customerName);
  if (!expected) return false;
  const names = [order?.shippingAddress?.name, order?.billingAddress?.name]
    .map(normalizeText)
    .filter(Boolean);
  return names.some((name) => {
    if (name === expected) return true;
    const hits = tokens.filter((token) => name.includes(token)).length;
    return tokens.length === 1
      ? tokens[0].length >= 4 && hits === 1
      : hits >= Math.min(2, tokens.length);
  });
}

function contactMatches(order, contact) {
  const expected = String(contact || "").trim();
  if (!expected) return false;
  if (expected.includes("@")) {
    return String(order?.email || "").toLowerCase() === expected.toLowerCase();
  }
  const digits = expected.replace(/\D/g, "");
  const phones = [order?.phone, order?.shippingAddress?.phone, order?.billingAddress?.phone]
    .map((phone) => String(phone || "").replace(/\D/g, ""))
    .filter(Boolean);
  return phones.some((phone) => {
    const length = Math.min(10, digits.length, phone.length);
    return length >= 7 && phone.slice(-length) === digits.slice(-length);
  });
}

function normalizeProduct(product) {
  const money = product?.priceRangeV2?.minVariantPrice || {};
  const inventory = Number(product?.totalInventory || 0);
  return {
    id: product?.id || "",
    title: product?.title || "",
    handle: product?.handle || "",
    product_url: product?.onlineStoreUrl || "",
    image_url: product?.featuredMedia?.preview?.image?.url || "",
    image_alt: product?.featuredMedia?.preview?.image?.altText || "",
    price: money.amount ? `${money.amount} ${money.currencyCode || ""}`.trim() : "",
    price_amount: Number(money.amount || 0),
    currency: money.currencyCode || "",
    available: inventory > 0,
    stock: Math.max(0, inventory),
  };
}

function collectTracking(order) {
  return (order?.fulfillments || []).flatMap((fulfillment) =>
    (fulfillment?.trackingInfo || []).map((tracking) => ({
      company: tracking?.company || "",
      number: tracking?.number || "",
      url: tracking?.url || "",
      fulfillment_status: fulfillment?.displayStatus || fulfillment?.status || "",
      estimated_delivery_at: fulfillment?.estimatedDeliveryAt || null,
    })),
  );
}

export async function searchProducts(admin, query, options = {}) {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) return { query: "", total: 0, products: [] };

  const response = await admin.graphql(PRODUCT_SEARCH_QUERY, {
    variables: {
      query: cleanQuery,
      first: Math.max(1, Math.min(20, Number(options.limit) || 5)),
    },
  });
  const payload = await response.json();
  const error = graphQLErrors(payload);
  if (error) throw new Error(error);
  const products = (payload?.data?.products?.nodes || []).map(normalizeProduct);
  return { query: cleanQuery, total: products.length, products };
}

export async function lookupOrderStatus(admin, input = {}) {
  const orderNumber = String(input.order_number || "").trim();
  const customerName = String(input.customer_name || "").trim();
  const contact = String(input.phone_or_email || "").trim();
  if (!orderNumber || !customerName || !contact) {
    return {
      found: false,
      matched: false,
      missing_fields: [
        !orderNumber ? "order_number" : null,
        !customerName ? "customer_name" : null,
        !contact ? "phone_or_email" : null,
      ].filter(Boolean),
    };
  }

  const cleanNumber = orderNumber.replace(/[^A-Za-z0-9#-]/g, "");
  const withoutHash = cleanNumber.replace(/^#+/, "");
  const prefixes = Array.isArray(input.order_prefixes) ? input.order_prefixes : [];
  const candidates = [
    cleanNumber.startsWith("#") ? `name:${cleanNumber}` : `name:#${cleanNumber}`,
    `name:${withoutHash}`,
    ...prefixes.map((prefix) => `name:${String(prefix).replace(/[^A-Za-z0-9-]/g, "")}-${withoutHash}`),
  ].filter(Boolean);

  let orders = [];
  for (const query of [...new Set(candidates)]) {
    const response = await admin.graphql(ORDER_STATUS_QUERY, {
      variables: { query },
    });
    const payload = await response.json();
    const error = graphQLErrors(payload);
    if (error) throw new Error(error);
    orders = payload?.data?.orders?.nodes || [];
    if (orders.length) break;
  }
  if (!orders.length) return { found: false, matched: false, not_found: true };

  const order = orders.find(
    (candidate) =>
      nameMatches(candidate, customerName) &&
      contactMatches(candidate, contact),
  );
  if (!order) return { found: true, matched: false };

  return {
    found: true,
    matched: true,
    order_name: order.name,
    created_at: order.createdAt,
    financial_status: order.displayFinancialStatus,
    fulfillment_status: order.displayFulfillmentStatus,
    delivery_city: order.shippingAddress?.city || order.billingAddress?.city || "",
    delivery_region:
      order.shippingAddress?.province || order.billingAddress?.province || "",
    tracking: collectTracking(order),
  };
}
