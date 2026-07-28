import assert from "node:assert/strict";
import test from "node:test";
import {
  lookupOrderStatus,
  searchProducts,
} from "./commerce.server.js";

function fakeAdmin(payload) {
  return {
    async graphql(query, options) {
      return {
        async json() {
          return typeof payload === "function" ? payload(query, options) : payload;
        },
      };
    },
  };
}

test("searchProducts normalizes Shopify products", async () => {
  const admin = fakeAdmin({
    data: {
      products: {
        nodes: [
          {
            id: "gid://shopify/Product/1",
            title: "Carro",
            handle: "carro",
            onlineStoreUrl: "https://store.test/products/carro",
            totalInventory: 4,
            featuredMedia: { preview: { image: { url: "https://img.test/1.jpg" } } },
            priceRangeV2: {
              minVariantPrice: { amount: "120000.00", currencyCode: "COP" },
            },
          },
        ],
      },
    },
  });

  const result = await searchProducts(admin, "carro");
  assert.equal(result.total, 1);
  assert.equal(result.products[0].stock, 4);
  assert.equal(result.products[0].currency, "COP");
});

test("lookupOrderStatus only returns details after identity validation", async () => {
  const admin = fakeAdmin({
    data: {
      orders: {
        nodes: [
          {
            name: "#1001",
            email: "ana@example.com",
            createdAt: "2026-07-18T12:00:00Z",
            displayFinancialStatus: "PAID",
            displayFulfillmentStatus: "FULFILLED",
            shippingAddress: { name: "Ana Gomez", city: "Medellin", province: "Antioquia" },
            billingAddress: null,
            fulfillments: [
              {
                displayStatus: "FULFILLED",
                trackingInfo: [
                  { company: "Coordinadora", number: "ABC123", url: "https://track.test/ABC123" },
                ],
              },
            ],
          },
        ],
      },
    },
  });

  const rejected = await lookupOrderStatus(admin, {
    order_number: "1001",
    customer_name: "Ana Gomez",
  });
  assert.deepEqual(rejected, {
    found: false,
    matched: false,
    missing_fields: ["phone_or_email"],
  });

  const wrongContact = await lookupOrderStatus(admin, {
    order_number: "1001",
    customer_name: "Ana Gomez",
    phone_or_email: "otra@example.com",
  });
  assert.deepEqual(wrongContact, { found: true, matched: false });

  const matched = await lookupOrderStatus(admin, {
    order_number: "1001",
    customer_name: "Ana Gomez",
    phone_or_email: "ana@example.com",
  });
  assert.equal(matched.matched, true);
  assert.equal(matched.tracking[0].number, "ABC123");
});
