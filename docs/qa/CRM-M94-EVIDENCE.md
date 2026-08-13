# CRM M94 — Trials notification durable claiming

## Objective

Prevent duplicate expiry notifications when more than one CRM service instance processes the same expired trial concurrently.

## Problem closed by M94

M93 persisted `notified_at` only after confirmed delivery. That made retries safe after failed delivery, but two independent service instances could still both read the same expired/unnotified trial and call the delivery port before either instance persisted `notified_at`.

## Permanent contract

- notification delivery requires a durable claim before `delivery.send()`
- claim ownership is represented by a dedicated `notification_task_uid`
- `schedule_cron_task_uid` remains reserved for M92 expiry scheduling
- pending selection requires `status = 'expired'`, `notified_at IS NULL` and `notification_task_uid IS NULL`
- claim acquisition is atomic compare-and-set
- unconfirmed or failed delivery releases only the matching claim
- successful delivery persists `notified_at` only while the caller still owns the matching claim
- successful finalization clears `notification_task_uid`
- multiple processors racing for the same trial produce at most one delivery call
- the service host requires an injected `createTaskUid`

## Schema compatibility

New databases receive `notification_task_uid` and the pending-notification index in the normal trials table definition.

Existing databases use `applyCrmM94Schema()`. It applies the prior CRM schema first, checks `information_schema.COLUMNS`, and runs the M94 `ALTER TABLE` only when the claim column is absent.

## Tests

Focused coverage proves:

- claim-before-delivery behavior
- release on unconfirmed delivery
- durable idempotency after notification
- two processor instances racing on shared state produce one claim and one delivery
- MySQL pending selection excludes claimed rows
- atomic claim acquisition with prepared values
- owner-only release
- owner-only notification finalization
- fail-closed behavior when claim ownership is lost
- schema upgrade skip when the column already exists
- schema upgrade execution when the column is absent

## Deliberately excluded

- concrete WhatsApp, email, SMS, Instagram or push provider
- provider-specific retry policy
- distributed lease expiry / stale-claim reclamation
- changes to trial lifecycle HTTP routes
- changes to M92 expiry scheduler ownership
- UI

## Promotion rule

Keep the PR in draft until Quality Gate and CRM Platform Auth Integration Contract are green on the same final helper-free head, the diff contains only permanent M94 files, and no review thread remains unresolved.
