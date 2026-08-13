# CRM M95 — Trials notification claim lease recovery

## Objective

Recover expired-trial notification work after a service instance crashes while owning the durable M94 notification claim.

## Problem closed by M95

M94 prevents duplicate cross-instance delivery by persisting `notification_task_uid` before calling the delivery port. If the owning process terminates after acquiring that claim and before releasing or finalizing it, the row remains claimed indefinitely and is excluded from future notification runs.

## Permanent contract

- notification claims carry a durable `notification_claimed_at` timestamp
- the processor requires an explicit claim lease duration of at least 1000ms
- pending scans include unclaimed rows, legacy M94 claims with no timestamp, and claims whose timestamp is at or before the stale cutoff
- live claims newer than the stale cutoff are not eligible
- claim acquisition/reclamation is a single atomic compare-and-set update
- reclaim writes a new task UID and a new claimed timestamp
- failed or unconfirmed delivery clears both task UID and claimed timestamp only for the current owner
- successful finalization clears both task UID and claimed timestamp only for the current owner
- M94 claims created before `notification_claimed_at` existed are recoverable instead of permanently stranded

## Schema compatibility

New databases receive `notification_claimed_at` and `crm_trials_notification_lease_idx` in the normal trials table definition.

Existing databases use `applyCrmM95Schema()`. It applies the M94 schema first, checks `information_schema.COLUMNS`, and runs the M95 `ALTER TABLE` only when the lease timestamp column is absent.

## Tests

Focused coverage proves:

- unsafe sub-second leases are rejected
- a live claim cannot be stolen
- a claim at the stale cutoff can be atomically recovered
- legacy M94 claims without a timestamp can be recovered
- cross-instance racing still results in only one delivery
- MySQL pending selection uses the stale cutoff as a prepared value
- atomic reclaim writes UID plus timestamp
- release and notification finalization clear the lease timestamp
- schema upgrade is skipped when already present and applied once when absent

## Deliberately excluded

- concrete WhatsApp, email, SMS, Instagram or push provider
- provider-specific retry/backoff policy
- heartbeat/lease renewal during very long delivery calls
- changes to M91 HTTP lifecycle routes
- changes to M92 expiry scheduler ownership
- UI

## Promotion rule

Keep the PR in draft until Quality Gate and CRM Platform Auth Integration Contract are green on the same final helper-free head, the diff contains only permanent M95 files, and no review thread remains unresolved.
