# Security baseline and incident runbook

This service handles customer conversations, contact details, order data, commerce credentials, and privileged messaging actions. Treat production access as sensitive and apply least privilege throughout.

## Required before the next production deploy

1. Rotate `DASHBOARD_KEY` and `VERIFY_TOKEN`. Earlier Git history contained hard-coded fallback values, so those values must be treated as public.
2. Configure independent random values for `DASHBOARD_SESSION_SECRET` and `DATA_ENCRYPTION_KEY`. Do not reuse the dashboard or webhook key.
3. Configure `PUBLIC_BASE_URL`, `META_APP_SECRET`, `PHONE_NUMBER_ID`, `SHOPIFY_STORE_DOMAIN`, and `SHOPIFY_STOREFRONT_DOMAIN` explicitly. Production now fails closed when critical security settings are absent or weak.
4. Ensure Meta signs WhatsApp, Instagram, and Messenger webhooks with the app secret. Never enable `ALLOW_UNSIGNED_WEBHOOKS` in production.
5. Restrict Supabase credentials to this service, enable row-level access controls where compatible with the server architecture, and ensure backups are encrypted.
6. Encrypt or delete historical plaintext conversation rows. New `user_message` and `bot_reply` values are encrypted automatically; existing rows remain readable for backward compatibility until migrated.

Generate independent keys locally and place them directly in the deployment secret manager, never in Git:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Automated checks

Run the complete local gate with:

```bash
pnpm run security:audit
```

It checks committed and untracked files for credential indicators and insecure authentication patterns, verifies the dependency lockfile, audits production dependencies, and runs unit plus end-to-end security tests. CI uses a frozen lockfile, disables dependency lifecycle scripts, pins third-party actions by commit, and runs with read-only repository permissions.

## Operational controls

- Master keys are accepted only through `X-Dashboard-Key`; never put credentials in URLs.
- Browser admin mutations require an exact same-origin request and use strict, HTTP-only session cookies.
- Login and admin traffic are rate-limited. Meta event IDs are deduplicated and customer message volume/length is bounded before AI processing.
- Product cards can only use URLs returned by the latest trusted catalog search. WhatsApp URL previews are disabled.
- Logs mask customer identifiers and omit conversation bodies, checkout values, ratings comments, and notification destinations.
- Admin responses use no-store caching, frame denial, MIME protections, a restrictive permissions policy, and Content Security Policy.

## Suspected breach procedure

1. Contain: pause retargeting and outbound automation, revoke affected sessions, restrict deployment access, and preserve logs. Do not destroy evidence.
2. Determine scope: identify the earliest suspicious event, affected tenants, exposed data, malicious sends, key use, and persistence mechanisms.
3. Rotate in this order: Meta/WhatsApp tokens and app secret, dashboard/session secrets, Supabase service and data-encryption keys, Shopify token, AI provider key, then deployment/GitHub credentials.
4. Eradicate: patch the root cause, remove unauthorized users/webhooks/deploy keys, and redeploy from a reviewed commit and frozen lockfile.
5. Recover: validate webhook signatures, admin access, tenant isolation, outbound messaging, database integrity, and monitoring before re-enabling automation.
6. Notify owners and affected parties according to contractual and legal obligations. Record decisions, evidence, timelines, and follow-up actions.

## Known residual risks

- The dashboard does not yet support MFA.
- Rate limits and event deduplication are in-memory and should move to a shared store before horizontal scaling.
- Customer identifiers and operational metadata remain visible in database columns; message bodies are encrypted, but full searchable identifier encryption requires a schema migration.
- Historical plaintext rows are not automatically rewritten.
- Detection currently relies on repository/CI checks and application telemetry; centralized immutable audit logging, WAF controls, and a SIEM are still recommended for production maturity.

These are explicit risk items, not claims of absolute security. Review them after every architectural or vendor change.
