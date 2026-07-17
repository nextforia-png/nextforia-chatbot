# Commerce integrations

NexforIA routes commerce operations through a tenant-aware adapter registry. The current
`rav-toys` tenant uses the Shopify adapter; WooCommerce and VTEX can be registered without
changing the bot conversation flow.

## Adapter contract

Every adapter must provide:

- `platform`: stable platform identifier such as `shopify`, `woocommerce`, or `vtex`.
- `searchProducts(query, options)`: normalized catalog search.
- `lookupOrderStatus(input, options)`: privacy-safe order lookup.
- `capabilities`: supported features exposed to health and onboarding screens.

Normalized product results keep the existing fields used by the bot: `title`,
`product_url`, `image_url`, `price`, `price_amount`, `currency`, `available`, and `stock`.

## Delivery order

1. Add persistent `tenant_integrations` and encrypted credentials.
2. Add Shopify OAuth install/uninstall and webhook handling.
3. Enable Shopify checkout-link creation in the adapter.
4. Build the WooCommerce plugin and register its adapter.
5. Pilot both connectors before adding VTEX.

Credentials must never be returned by health endpoints or written to conversation logs.
