# NexforIA Commerce for Shopify

Embedded Shopify app that connects a merchant catalog and order status to the NexforIA
commerce adapter.

## Current capabilities

- OAuth installation and encrypted, durable session storage in the existing NexforIA backend.
- Read-only product search and inventory lookup.
- Privacy-safe order lookup that validates customer identity before returning details.
- Uninstall and scope-change webhooks.
- Embedded connection-status screen.
- Signed pairing code flow for connecting a Shopify store to one NexforIA bot.

## Local development

```bash
pnpm install
shopify app dev
```

Shopify CLI updates the development URLs automatically. The app requests only
`read_products`, `read_inventory`, and `read_orders`.

Set `NEXFORIA_PAIRING_SECRET` in both this app and the NexforIA backend. Also set the
same `NEXFORIA_COMMERCE_SERVICE_SECRET` in both services and point
`NEXFORIA_BACKEND_URL` to `https://nextforia.com`. The backend creates short-lived
pairing codes and the app confirms the installation server-to-server so the Customer
Panel and Super Admin read the same tenant record.

## Verification

```bash
pnpm test
pnpm lint
pnpm build
shopify app config validate --json
```

Access tokens must remain in server-side encrypted storage and must never be sent to
the browser or conversation logs.
