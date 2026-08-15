# M148 — Transactional Ticketing Check-in Boundary

## Objective

Close the M147 consistency gap before any public Ticketing runtime: ticket state mutation, check-in history and offline sync evidence must commit atomically or roll back together.

## Scope

- `MySqlTicketingTransactionalCommand` owns online and offline lifecycle commits.
- A validated exported adapter canonicalizes commands and rejects identity, immutable-authority, lifecycle or channel mismatches before the raw persistence boundary.
- `before`, `after` and `checkIn` must refer to the same ticket; immutable ticket authority cannot change inside a check-in command.
- The requested `after` lifecycle must be exactly derivable from `before + checkIn` through the domain transition function.
- Offline commands additionally couple envelope ticket identity, operation/result, queued timestamp and sync timestamp to the canonical check-in.
- The transaction locks the ticket row before applying a transition.
- Online check-in writes ticket state + check-in history in one MySQL transaction.
- Offline sync writes envelope + ticket state + check-in + sync marker in one transaction.
- Existing deterministic attempts replay from persisted evidence instead of advancing the lifecycle again.
- Check-in identity is versioned as `ticket-checkin:v2` and is based on ticket + stable attempt kind + occurredAt, not on the result inferred from mutable current state.
- Exact QR retry therefore replays the original validation rather than accidentally turning `validated` into `used`.
- Divergent replay identity and concurrent stale transitions fail closed.
- The M148 transaction integration uses its own `ticketing_m148_test` database so it cannot interfere with the M147 persistence regression suite when test files execute concurrently.

## Executable evidence

- application tests prove QR exact replay and offline exact replay;
- cross-ticket command input is rejected before persistence and leaves the authoritative ticket unchanged;
- two distinct transitions built from the same stale ticket snapshot execute concurrently and prove exactly one commit while the loser fails with `TICKETING_CONCURRENT_TRANSITION`;
- MySQL 8.4 integration proves atomic ticket-state + history commit;
- a forced `BEFORE INSERT` check-in failure proves online ticket-state rollback;
- the same failure mechanism on offline sync proves envelope + ticket state + history all roll back together;
- successful offline integration proves envelope, state, history and sync marker are committed together and replay exactly once;
- permanent `Ticketing M148 Transaction Contract` runs lint, typecheck, application tests, isolated MySQL transaction integration and build.

The final promotion candidate must pass Quality Gate, the M147 Ticketing regression contract and the M148 transaction contract on one identical head. Automatic formatting commits are not accepted as final evidence; temporary formatter workflows are removed before the final checkpoint.

## Boundaries

M148 does not add a public HTTP API, browser check-in UI, QR image rendering, device credential provisioning or production activation. Signing material remains server-side. Those capabilities require their own Auth/CSRF/role/rate-limit/audit and device-security contracts.

`FEATURE-0011` / `MIG-0017` remain `migrating`; M148 hardens backend correctness without claiming Ticketing equivalence or release.
