# Customer Panel — Appointment module v419

## Scope

This release turns the supplied Appointment design into a tenant-scoped Customer Panel experience. It preserves the shared Customer Panel inbox and existing calendar, authentication, plan, and tenant contracts.

Plans remain unchanged:

- Nextfor Uno / Aura: customer-service module only.
- Nextfor Tempo: appointment module only.
- Nextfor Atlas: both modules, with the existing Atlas intent coordinator.

## Customer experience

- **Citas:** current-week calendar and list, week navigation, tenant timezone, role-aware confirm/cancel/review actions, and real calendar state.
- **Conversaciones:** opens the canonical Customer Panel inbox using `customer_conversation_id`; voice provider call IDs are never presented as customer chats.
- **Recordatorios:** durable schedule, pause/resume/send-now/retry actions, delivery/read/reply correlation, confirmation metrics, bounded retries, and handoff notification on no response.
- **Cómo agendar:** durable rules and dated exceptions with optimistic revision control. A `reschedule` exception marks affected appointments for review and creates a tenant-scoped notification when a real customer conversation exists.
- **Mobile:** appointment-specific Panel, Agenda, Chats, and Recordatorios navigation; mobile uses the same APIs and entitlements as desktop.

## API contracts

- `GET /admin/panel/appointments-data`
- `POST /admin/panel/appointments/action`
- `GET /admin/panel/appointment-settings`
- `PUT /admin/panel/appointment-settings`
- `POST /admin/panel/appointment-reminders/:reminderId/action`

Every route derives `tenant_id` from the signed Customer Panel session. No tenant identifier is accepted from URL, query, or request body.

## Database

Apply before enabling persistence in Staging:

- Up: `docs/migrations/20260820_appointment_operations_v1_up.sql`
- Down: `docs/migrations/20260820_appointment_operations_v1_down.sql`

The migration separates `appointment_id` from `customer_conversation_id`, adds durable reminder/event tables, forces RLS, grants only `service_role`, and provides the atomic `claim_due_appointment_reminders` RPC.

Rollback is intentionally blocked if multiple appointments already share one legacy conversation, because restoring the old unique constraint would lose data.

## Staging configuration

```text
APPOINTMENT_PANEL_V2_ENABLED=1
APPOINTMENT_REMINDERS_V1_ENABLED=1
APPOINTMENT_REMINDER_SENDS_ENABLED=0
```

Keep real reminder sends disabled until the Meta utility template is approved and the following value matches the approved template name:

```text
APPOINTMENT_REMINDER_TEMPLATE_NAME=appointment_reminder_nextfor
```

After template approval and one real tenant-scoped delivery/read/reply test, set `APPOINTMENT_REMINDER_SENDS_ENABLED=1` in Staging only.

## Demo URLs

- Tempo desktop: `/admin/panel-demo?tab=appointments&plan=tempo&view=agenda`
- Recordatorios: `/admin/panel-demo?tab=appointments&plan=tempo&view=reminders`
- Cómo agendar: `/admin/panel-demo?tab=appointments&plan=tempo&view=rules`
- Atlas: replace `plan=tempo` with `plan=atlas`.

Demo data is presentation-only and is never mixed with authenticated tenant data.

## Verification

- `node --check index.js`
- `node appointment-operations.test.js`
- `node appointment-panel-v2.e2e.test.js`
- `pnpm test`
- `pnpm test:channels`
- `pnpm security:scan`

The v2 E2E test uses two tenants with the same appointment ID and proves isolated settings, reminders, mutations, and appointment state.

## Rollback

1. Set `APPOINTMENT_REMINDER_SENDS_ENABLED=0` to stop outbound reminder work immediately.
2. Set `APPOINTMENT_PANEL_V2_ENABLED=0` and `APPOINTMENT_REMINDERS_V1_ENABLED=0` to hide v2 data/actions while preserving records.
3. Roll back the application commit.
4. Run the down migration only if its duplicate-conversation safety check passes.
