# Nextfor Conversation Intelligence Contract v1

Status: implemented in code and additive migration; not deployed by this change.

Owner: Core Platform. Consumers: Super Admin, Customer Service Bot, Appointment Bot, Commerce Connectors and Bot Ops.

## 1. Canonical relationship

```text
conversation_intelligence
  (tenant_id, channel, conversation_id)
       │
       ├── tenant_id ───────────────► tenants.id
       ├── channel / active_bot_id ─► current channel and bot route
       ├── outcome_type/status ─────► current conversation outcome
       ├── business objects ────────► appointment or order + value/status
       ├── bot_ops_conversation_key ► existing bot_ops_findings
       └── detail loader ───────────► existing conversation_logs (only on open)
```

This contract does **not** replace or duplicate:

- message bodies in `conversation_logs`;
- appointment data in `appointments`;
- order state in the existing Customer Order store;
- reviews and findings in `bot_ops_findings`.

`conversation_intelligence` is the small, indexed read model. `conversation_business_objects` is the canonical relationship between a conversation and an appointment/order.

## 2. Permanent conversation identity

Every operation requires the complete composite identity:

```json
{
  "tenant_id": "tenant-a",
  "channel": "whatsapp",
  "conversation_id": "wa:573001112233"
}
```

- `tenant_id` must already exist in `tenants.id`.
- `channel` is the normalized channel name.
- `conversation_id` is the existing customer-thread identifier. It is never a provider call ID.
- `primary_bot_id` is required and permanent; `active_bot_id` is required and may change when Atlas routes the turn.
- IDs are unique only as `(tenant_id, channel, conversation_id)`.
- An appointment or order cannot be reassigned to another conversation by an upsert. A conflict is blocked.

The Bot Ops join key is SHA-256 of `tenant_id + 0x1f + channel + 0x1f + conversation_id`. All consumers must call `botOpsConversationKey()`; they must not create another formula.

## 3. Conversation summary write contract

Use `normalizeConversationSummary()` and `createConversationIntelligenceService(...).upsertSummary()`/`upsert_conversation_intelligence_v1`.

```json
{
  "contract_version": 1,
  "tenant_id": "tenant-a",
  "conversation_id": "wa:573001112233",
  "channel": "whatsapp",
  "channel_connection_id": "optional-existing-connection-ref",
  "primary_bot_id": "customer_service",
  "active_bot_id": "appointments",
  "customer_ref": "optional-existing-customer-ref",
  "conversation_status": "open",
  "outcome_type": "appointment",
  "outcome_status": "confirmed",
  "outcome_reason": "appointment:booked",
  "outcome_updated_at": "2026-08-22T12:00:00.000Z",
  "first_message_at": "2026-08-22T11:45:00.000Z",
  "last_message_at": "2026-08-22T12:00:00.000Z",
  "message_count": 8,
  "last_message_preview": "Máximo 240 caracteres; nunca el historial completo",
  "last_message_direction": "customer",
  "needs_human": false,
  "bot_ops_conversation_key": "computed-by-contract",
  "created_at": "2026-08-22T11:45:00.000Z",
  "updated_at": "2026-08-22T12:00:00.000Z"
}
```

Enums:

- `conversation_status`: `open | resolved | archived`
- `outcome_type`: `unknown | support | appointment | order | handoff | mixed`
- `outcome_status`: `potential | confirmed | paid | lost | cancelled | null`
- `last_message_direction`: `customer | bot | human | system | null`

Older writes cannot replace a newer message preview or outcome. `message_count` never decreases and `first_message_at`/`last_message_at` expand monotonically.

`outcome_status` is a value lifecycle, so it is valid only with `appointment`, `order` or `mixed`. Support/handoff outcomes keep it `null`.

## 4. Appointment/order and monetary contract

Use `normalizeBusinessObject()` and `createConversationIntelligenceService(...).linkBusinessObject()`/`upsert_conversation_business_object_v1`.

```json
{
  "contract_version": 1,
  "tenant_id": "tenant-a",
  "conversation_id": "wa:573001112233",
  "channel": "whatsapp",
  "object_type": "order",
  "object_id": "ord-1",
  "object_status": "pagado",
  "value_status": "paid",
  "amount_minor": 189900,
  "currency": "COP",
  "is_primary": true,
  "source_event_id": "order:ord-1:revision:2",
  "occurred_at": "2026-08-22T12:00:00.000Z",
  "metadata": {},
  "updated_at": "2026-08-22T12:00:00.000Z"
}
```

`amount_minor` is a non-negative integer in the currency's minor unit. Examples: `189900 COP`; `1099 USD` means USD 10.99. If the amount is unknown, both `amount_minor` and `currency` are `null`. Do not invent a monetary amount.

Value definitions:

- `potential`: intent, quote, requested appointment or unconfirmed order.
- `confirmed`: appointment/order is confirmed, but payment is not verified.
- `paid`: payment was verified by the authoritative payment/commerce source.
- `lost`: opportunity explicitly closed without conversion.
- `cancelled`: a previously active appointment/order was cancelled or refunded.

Allowed transitions for one business object:

```text
potential ─► confirmed ─► paid ─► cancelled
    │             │
    ├─────────────┴────► lost
    └──────────────────► cancelled

lost/cancelled ─► potential or confirmed (only a newer authoritative reactivation)
```

Normally a new opportunity uses a new appointment/order ID. A newer authoritative event may reactivate a lost/cancelled object because the current Appointment workflow can reprogram an existing appointment. Delayed older events are ignored. `paid` can move only to `cancelled`; it cannot regress to `potential` or `confirmed`.

Default adapters preserve current systems:

- Appointment: `requested/not_requested → potential`, `booked/rescheduled → confirmed`, `failed → lost`, `cancelled → cancelled`.
- Order: `por_confirmar → potential`, explicit `confirmed/confirmado → confirmed`, `pagado/preparacion/enviado → paid`, `cancelado/refunded → cancelled`.
- An explicit `value_status` from an authoritative source overrides the default adapter.

## 5. Read contracts

### Summary-first list

Call:

```text
list_conversation_intelligence_summaries_v1(
  p_tenant_id,
  p_limit <= 200,
  p_before_activity,
  p_before_id
)
```

The result contains identity, route, outcome, message counts/preview, appointment/order counts, separate `potential_value_minor`, `confirmed_value_minor`, `paid_value_minor`, `lost_cancelled_count`, and Bot Ops count/severity/date. It does not select `user_message`, `bot_reply`, encrypted payloads or full messages.

Pagination is keyset-based: the next request uses the last row's `last_message_at` (or `updated_at` when null) and `id` as `p_before_activity` and `p_before_id`. Do not use large offsets.

Indexes are tenant-first, then activity/outcome/route, so a tenant cannot be omitted from an efficient list query.

### Open-one detail

Call `createConversationIntelligenceService(...).getDetail(tenantId, identity, page)` only after a user opens one conversation. It returns:

```json
{
  "contract_version": 1,
  "conversation": {},
  "business_objects": [],
  "bot_ops_findings": [],
  "messages": []
}
```

The injected message loader must use the existing encrypted `conversation_logs` loader and the same `(tenant_id, channel, conversation_id)`. `normalizeDetailPageQuery()` enforces keyset inputs (`before_message_at`, `before_message_id`) and at most 200 message rows per request. Conversation Intelligence never stores a second message history.

## 6. Isolation and permissions

- Both tables have forced RLS.
- `anon` and `authenticated` receive no table/function access.
- Only the backend `service_role` can call the write/read RPCs.
- Every foreign key and query starts with `tenant_id`.
- `tenants.id` uses `ON DELETE RESTRICT`.
- Appointment/order reassignment is blocked.
- The down migration refuses to drop tables after the first real row. A code rollback may safely leave the additive schema in place.

Historical conversations are not guessed or backfilled by this migration. Any future backfill must be tenant-scoped, previewed and approved separately.

## 7. Required downstream handoffs

### Super Admin

- List with `list_conversation_intelligence_summaries_v1`; never list directly from `conversation_logs`.
- Use the server-authorized tenant filter. A URL parameter is never authority.
- Call `getDetail()` only when one row opens.
- Display the five value statuses exactly; report `lost` and `cancelled` separately even when using the combined count for a compact summary.
- Do not create a Super Admin-specific conversation/outcome/value table.

### Customer Service Bot / ChatBot

- After the turn is durably written to `conversation_logs`, call `upsertSummary()` with the same tenant/channel/conversation ID.
- Set `primary_bot_id` only at conversation creation; set `active_bot_id` whenever Atlas routing changes.
- Commercial intent may create/update `potential`; never mark `confirmed` or `paid` from language alone.
- Do not copy full messages into this contract.

### Appointment Bot

- After the appointment is durably saved, call `businessObjectFromAppointment()` then `linkBusinessObject()`.
- Use `customer_conversation_id`, never the ElevenLabs/provider `conversation_id` fallback.
- Preserve `appointment_id` and the appointment's real status. Do not create a Conversation Intelligence appointment record without an existing appointment.
- Pass an amount only when the appointment source has a verified price.

### Commerce Connectors

- After the order state is durably saved, call `businessObjectFromOrder()` then `linkBusinessObject()`.
- Preserve the existing order ID, revision, total and currency.
- Mark `paid` only from the connector/payment source that verified payment; a payment link or customer claim remains `potential`/`confirmed`.
- Do not create connector-specific conversation outcome/value columns.

### Bot Ops

- Continue storing reviews in `bot_ops_findings`; do not add another review table.
- Use `botOpsConversationKey()` for `conversation_key` so summary joins are exact and privacy-safe.
- Summary consumers receive only open count, highest severity and last review timestamp. Bot Ops remains the authority for evidence, recommendations, approval and resolution.
- Findings must keep the same `tenant_id`, channel and conversation key as the conversation event.

## 8. Code entry points

- Contract, validation, adapters and stores: `conversation-intelligence.js`
- Database migration: `docs/migrations/20260822_conversation_intelligence_v1_up.sql`
- Safe rollback guard: `docs/migrations/20260822_conversation_intelligence_v1_down.sql`
- Regression suite: `conversation-intelligence.test.js`

No consumer may add a sixth value status or a parallel table without a versioned Core Platform contract migration.
