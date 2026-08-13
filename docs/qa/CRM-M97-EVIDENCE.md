# CRM M97 — Stable trial notification provider idempotency key evidence

## Objective

Close the provider-facing duplicate-delivery gap that remains after M95 durable claim recovery and M96 claim heartbeats.

A provider can accept a notification and the CRM process can still fail before `notified_at` is committed. The next healthy claim owner must therefore retry the same logical notification with the same provider idempotency key instead of a new claim-specific key.

## Contract

M97 adds `idempotencyKey` to `CrmTrialNotificationDeliveryPort.send()`.

The key is derived only from the logical event version and durable trial id:

`crm.trial.expired.notification:v1:<trialId>`

It deliberately does not include `notification_task_uid`, timestamps, process ids, attempt numbers or claim owners.

## Recovery semantics

- a normal first delivery receives the stable key;
- a failed delivery that releases its claim and is retried by a new task UID receives the same key;
- a stale/crashed M95 claim recovered by another instance receives the same key;
- different trial ids receive different keys;
- the `v1` namespace allows a future intentionally distinct notification contract to use a new logical idempotency namespace.

## Boundary

M97 defines and propagates the stable provider idempotency contract. It does not introduce a concrete notification provider and cannot force a provider without idempotency support to deduplicate deliveries.

A future concrete adapter must forward `idempotencyKey` to the provider's native idempotency/deduplication mechanism or implement an equivalent durable adapter-side deduplication contract.

## Regression coverage

Focused domain tests prove stable key generation, propagation to delivery, stability across a released retry with a different claim UID, stability after stale-claim recovery, preservation of M96 heartbeat behavior and preservation of existing claim/finalization semantics.
