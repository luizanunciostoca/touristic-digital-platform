# CRM M96 — Trial notification lease heartbeat evidence

## Objective

Prevent a healthy long-running trial-expiry notification delivery from becoming reclaimable merely because `delivery.send()` lasts longer than the M95 claim lease.

## Contract

M96 extends the M95 durable notification claim with owner-only heartbeat renewal while delivery is pending.

- `renewNotificationClaim(id, taskUid, renewedAt)` updates only an expired, unnotified trial still owned by the same `notification_task_uid`.
- The processor renews at approximately one third of `claimLeaseMs`, with a minimum interval of 250 ms.
- Heartbeats stop when delivery settles.
- A failed renewal or owner mismatch is treated fail-closed: the processor does not persist `notified_at` or append the successful-delivery interaction as the previous owner.
- M95 stale-claim recovery remains unchanged for crashed processes because a dead process stops heartbeating and its timestamp eventually ages beyond the lease.

## Persistence

No schema change is required. M96 reuses `notification_claimed_at` introduced by M95.

The MySQL heartbeat update is prepared and owner-guarded:

```sql
UPDATE crm_trials
SET notification_claimed_at = ?
WHERE id = ?
  AND status = 'expired'
  AND notified_at IS NULL
  AND notification_task_uid = ?
```

`affectedRows === 1` means ownership was successfully renewed; otherwise ownership is considered lost.

## Regression coverage

Focused tests cover:

1. heartbeat renewal during a pending long-running delivery;
2. a second processor remaining unable to reclaim after the original lease boundary when the first processor has renewed;
3. fail-closed behavior when heartbeat ownership is lost;
4. owner-only prepared MySQL heartbeat update;
5. false return when the heartbeat UID no longer owns the claim;
6. preservation of M95 live/stale/legacy claim behavior and M94/M93 notification semantics.

## Deliberate boundary

M96 protects the durable claim while the application and database are healthy. It does not claim provider-level exactly-once semantics. If an external provider accepts a send and the application loses claim ownership before durable acknowledgement, provider idempotency must be handled by the future concrete delivery adapter contract.
