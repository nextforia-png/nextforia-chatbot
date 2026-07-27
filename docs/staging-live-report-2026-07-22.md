# Customer Access v2 — Staging live report

Date: 2026-07-22 (America/Bogota)

## Outcome

Customer Access v2 is active only in the isolated Staging environment. Production and the public landing page were not changed.

## Staging resources

- Application: `https://staging.nextforia.com`
- Render environment: `Staging`
- Render service: `nextforia-staging`
- GitHub branch deployed: `codex/staging-customer-panel`
- Application implementation commit: `1b5e7452b34b33b984ff5e9f4d01954e05fa15b7`
- Supabase project: `nextforia-staging` (`qhsstmgxfwmmsbcwcjus`)
- Resend sending domain: `mail-staging.nextforia.com`
- Feature gate: `CUSTOMER_ACCESS_V2_ENABLED=1` in Staging only

The deployed commit includes the shared access contract from `741c4b8` and the stable Super Admin service implementation from `0c8528b`.

## What already existed

- Separate Super Admin and Customer Panel interfaces.
- Super Admin authentication using the private platform key.
- The four-field customer creation form: company, administrator email, plan and assigned bot.
- Customer invitation, password setup and email/password login code behind the v2 feature gate.
- Signed, tenant-bound customer sessions with membership revalidation.
- Unit, security, smoke, visual and A/B tenant-isolation test coverage.

## Changes made to Staging

1. Created an isolated Supabase project and applied `docs/migrations/20260721_customer_access_v2_up.sql`.
2. Created an isolated Resend API key and verified DKIM, SPF and MX for `mail-staging.nextforia.com`.
3. Created the Render `Staging` environment and `nextforia-staging` service.
4. Connected the service to `codex/staging-customer-panel`; the application implementation under test is the commit listed above. Later documentation-only commits do not change runtime behavior.
5. Added only Staging credentials and safe placeholders; no production WhatsApp, Anthropic or tenant secrets were copied.
6. Added and verified the Cloudflare hostname `staging.nextforia.com` with SSL.
7. Set `PUBLIC_BASE_URL` and `CUSTOMER_PANEL_BASE_URL` to the Staging hostname and activated the v2 feature gate only after all isolated dependencies were ready.

## Live validation completed

- Health endpoint returned HTTP 200 after the final deployment.
- Super Admin authenticated and opened the customer-creation flow.
- Super Admin created `NextforIA Staging QA` with the four required fields.
- Resend recorded the invitation to `ravtoys@gmail.com` as `delivered`.
- The invited email was read-only on the password-setup screen.
- The customer created a password and was redirected into the Customer Panel.
- A fresh email/password login returned HTTP 200 with role `admin` and tenant `nextforia-staging-qa-1fcaf4`.
- Session revalidation returned the same user and tenant from the signed session.
- Reusing the invitation returned HTTP 409.
- An invalid invitation returned HTTP 403.
- Public signup/register routes returned HTTP 404.
- The local A/B E2E matrix on the deployed commit covers cross-tenant read/write denial, altered-cookie denial, revoked invitation and expired invitation cases.

## Known follow-up

- The Customer Panel shell still displays the legacy `RAV Toys` brand in parts of the UI even though the authenticated v2 session is correctly bound to `NextforIA Staging QA`. This is a presentation issue, not a tenant-session leak, but it should be corrected before production approval.
- The expired-invitation case is covered by the automated service/E2E suite. A live one-hour expiration wait was not performed because the configured minimum TTL is one hour.
- The free Render instance may sleep after inactivity, causing a cold-start delay.

## Production safety check

The production service remained on `v88-instagram-webhook-parser` after Staging activation. No production deployment, environment variable, database, DNS landing record or landing-page code was changed.

## Rollback

1. Set `CUSTOMER_ACCESS_V2_ENABLED=0` in the Render `Staging` service and redeploy. This immediately restores the legacy access behavior without deleting data.
2. If application rollback is also required, redeploy the previous successful Render deployment or reconnect the service to the previous known-good commit.
3. Keep the Supabase data intact while investigating. Before any schema rollback, take a database backup.
4. Only after backup, apply `docs/migrations/20260721_customer_access_v2_down.sql` to the Staging Supabase project.
5. Revoke the Staging Resend API key and remove `mail-staging.nextforia.com` DNS records only if the Staging environment is being retired.
6. Remove the `staging.nextforia.com` custom domain and Render service only as a final teardown step.
