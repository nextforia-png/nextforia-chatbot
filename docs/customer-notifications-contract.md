# Customer notifications contract

This contract defines the tenant-safe notification channel used by the Customer Panel and reserved for future Nextfor mobile clients.

## Event

`human_handoff_required` is created only after the conversation turn containing `request_human_handoff` has been persisted successfully. The event is idempotent for a repeated source event and contains:

- `id`
- `tenant_id`
- `type`, `priority`, `reason`
- `conversation_id`, `channel`, `customer_label`
- `title`, `message`
- `action_label`, `action_url`
- `created_at`

`action_url` is always a same-origin Customer Panel URL that opens the exact conversation.

## Customer API

All endpoints derive `tenant_id` and the recipient identity from the signed, revalidated Customer Panel session. A tenant or actor supplied by URL, query string, or request body is ignored.

- `GET /admin/panel/notifications`: persistent notification inbox and unread count.
- `GET /admin/panel/notifications/events`: Server-Sent Events stream. Event name: `notification`.
- `POST /admin/panel/notifications/:notificationId/read`: per-user read receipt.
- `PUT /admin/panel/notifications/push-subscription`: register the current browser device.
- `DELETE /admin/panel/notifications/push-subscription`: unregister one browser device.
- `GET /admin/customer-notification-sw.js`: Web Push service worker.

The SSE stream reconnects periodically through normal session revalidation. Web Push delivery revalidates that the subscription owner still has an active membership in the same tenant. Logout disables the user's registered push subscriptions.

## Delivery behavior

1. The bot requests human intervention.
2. The conversation and handoff state are persisted.
3. A tenant-scoped event is stored and emitted.
4. Open Customer Panels receive it over SSE, display a fixed alert, and play a sound after browser audio has been unlocked by user interaction.
5. Subscribed browsers receive Web Push when supported and permitted by the user.
6. Selecting either alert opens `tab=conversations` with the exact `conversation_id` selected.

The future mobile app should consume the same persistent event schema. A native push adapter can be added beside Web Push without changing the bot trigger or event contract.
