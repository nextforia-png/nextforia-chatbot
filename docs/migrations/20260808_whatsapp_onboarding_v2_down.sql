-- Safe application rollback for WhatsApp Embedded Signup v2.
--
-- Disable CHANNEL_CONNECTIONS_DEDICATED_STORE_ENABLED and roll the application
-- back first. The schema and immutable registration ledger intentionally remain:
-- deleting either could repeat /register inside Meta's 72-hour safety window.
-- A later archival migration may remove these objects only after there are no
-- active onboarding attempts and every claim is older than 72 hours.

begin;

-- No destructive schema changes by design.

commit;
