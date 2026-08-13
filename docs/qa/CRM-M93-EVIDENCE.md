# CRM M93 — Trials expiry notification evidence

## Scope

M93 adds the channel-neutral notification boundary for expired CRM trials after M92 introduced automatic expiry.

The milestone persists successful notification delivery in the existing `crm_trials.notified_at` field and exposes an overlap-safe service host with an injected delivery port.

## Frozen behavior

- only trials with `status = 'expired'` and `notified_at IS NULL` are eligible;
- notification delivery is channel-neutral through `CrmTrialNotificationDeliveryPort`;
- `notified_at` is written only after the delivery port confirms `delivered: true`;
- the durable write is guarded by `status = 'expired' AND notified_at IS NULL`;
- a successful notification appends a system interaction to the lead timeline;
- a rejected/failed delivery leaves `notified_at` null so the item remains retryable;
- subsequent runs do not redeliver a trial once `notified_at` is durable;
- the service host coalesces overlapping executions and isolates run errors.

## Deliberately not included

M93 does not select or implement a concrete delivery provider or channel. WhatsApp, email, SMS, Instagram, push notification or any other adapter must be implemented separately against the frozen delivery port.

M93 also does not change:

- M89 trial lifecycle semantics;
- M91 authenticated HTTP routes;
- M92 automatic expiry claim semantics;
- lead stage during expiry/notification;
- historical V1 data.

## Permanent executable evidence

- `packages/crm/src/trials-notification.test.ts`
- `services/crm/src/mysql-trials-repository.test.ts`
- `services/crm/src/trials-notification-host.test.ts`

The tests prove successful durable notification, retryability after delivery failure, post-notification idempotency, prepared MySQL writes, compare-and-set notification persistence, and overlap-safe host execution.

## Promotion gate

M93 may be promoted only when Quality Gate and CRM Platform Auth Integration Contract are green on the same final helper-free head, the PR contains only permanent M93 files, and no review thread remains unresolved.
