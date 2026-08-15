# M148 — Transactional Ticketing Check-in Boundary

## Objective

Close the M147 consistency gap before any public Ticketing runtime: ticket state mutation, check-in history and offline sync evidence must commit atomically or roll back together.

## Scope

- `MySqlTicketingTransactionalCommand` owns online and offline lifecycle commits.
- The transaction locks the ticket row before applying a transition.
- Online check-in writes ticket state + check-in history in one MySQL transaction.
- Offline sync writes envelope + ticket state + check-in + sync marker in one transaction.
- Existing deterministic attempts replay from persisted evidence instead of advancing the lifecycle again.
- Check-in identity is versioned as `ticket-checkin:v2` and is based on ticket + stable attempt kind + occurredAt, not on the result inferred from mutable current state.
- Exact QR retry therefore replays the original validation rather than accidentally turning `validated` into `used`.
- Divergent replay identity and concurrent stale transitions fail closed.

## Executable evidence

- application tests prove QR exact replay and offline exact replay;
- MySQL 8.4 integration proves atomic state/history commit;
- a forced `BEFORE INSERT` check-in failure proves ticket-state rollback;
- offline integration proves envelope, state, history and sync marker are committed together;
- permanent `Ticketing M148 Transaction Contract` runs lint, typecheck, application tests, MySQL transaction integration and build.

The final promotion candidate must pass Quality Gate, the M147 Ticketing regression contract and the M148 transaction contract on one identical head. Automatic formatting commits are not accepted as final evidence; the final checkpoint is produced by a normal repository commit after all temporary tooling has been removed.

## Boundaries

M148 does not add a public HTTP API, browser check-in UI, QR image rendering, device credential provisioning or production activation. Signing material remains server-side. Those capabilities require their own Auth/CSRF/role/rate-limit/audit and device-security contracts.

`FEATURE-0011` / `MIG-0017` remain `migrating`; M148 hardens backend correctness without claiming Ticketing equivalence or release.
